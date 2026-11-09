"""Sensor readings and camera/upload images -> pollution events -> (maybe) bounties."""
import logging
from math import ceil

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import schemas
from app.adapters.ai_adapter import call_ai, types
from app.errors import ApiError
from app.models import Bounty, Device, Event, Media, Reading, aware
from app.security import token_matches
from app.services.bounties import maybe_create_for_event

log = logging.getLogger("rivermind")
HISTORY = 30  # readings handed to the anomaly detector
WASTE_THRESHOLD = 0.5


def severity(score: float) -> int:
    """CONTRACT: clamp(ceil(5 x score), 1, 5) for both event types."""
    return max(1, min(5, ceil(5 * score)))


def _sensor(r) -> "types.SensorReading":
    return types.SensorReading(ts=aware(r.ts).isoformat(), turbidity_ntu=r.turbidity_ntu, ph=r.ph,
                               tds_ppm=r.tds_ppm, temp_c=r.temp_c)


def _links(session: Session, event: Event | None) -> tuple[str | None, str | None]:
    if event is None:
        return None, None
    return event.id, session.scalar(select(Bounty.id).where(Bounty.event_id == event.id))


def ingest_reading(session: Session, body: schemas.ReadingIn, token: str | None) -> schemas.ReadingCreated:
    device = session.get(Device, body.device_id)
    if device is None or not token_matches(token, device.token_hash):
        raise ApiError("UNAUTHORIZED", "Missing or invalid device token")

    def duplicate() -> schemas.ReadingCreated:
        old = session.scalar(select(Reading).where(Reading.device_id == body.device_id, Reading.seq == body.seq))
        event_id, bounty_id = _links(session, session.scalar(select(Event).where(Event.reading_id == old.id)))
        return schemas.ReadingCreated(reading_id=old.id, duplicate=True, event_id=event_id, bounty_id=bounty_id)

    if session.scalar(select(Reading.id).where(Reading.device_id == body.device_id, Reading.seq == body.seq)):
        return duplicate()
    history = list(session.scalars(select(Reading).where(Reading.device_id == body.device_id)
                                   .order_by(Reading.seq.desc()).limit(HISTORY)))
    reading = Reading(**body.model_dump())
    session.add(reading)
    try:
        session.flush()
    except IntegrityError:  # same seq arrived concurrently
        session.rollback()
        return duplicate()

    event = None
    try:
        result = call_ai("detect_sensor_anomaly", _sensor(reading), [_sensor(h) for h in reversed(history)])
    except ApiError:
        result = None  # the reading is still stored; the device never sees AI errors
    if result is not None and result.anomaly:
        label = "Simulated reading: " if reading.simulated else ""
        event = Event(type="SENSOR_ANOMALY", severity=severity(result.score), waste_score=0.0,
                      summary=f"{label}{result.reason}"[:1000], lat=reading.lat, lon=reading.lon,
                      reading_id=reading.id)
        session.add(event)
        session.flush()
        maybe_create_for_event(session, event)
    session.commit()
    event_id, bounty_id = _links(session, event)
    return schemas.ReadingCreated(reading_id=reading.id, duplicate=False, event_id=event_id, bounty_id=bounty_id)


def list_readings(session: Session, device_id: str, limit: int) -> schemas.ReadingsResponse:
    rows = session.scalars(select(Reading).where(Reading.device_id == device_id)
                           .order_by(Reading.seq.desc()).limit(limit))
    return schemas.ReadingsResponse(items=[schemas.ReadingOut.model_validate(r) for r in rows])


def analyze_media(session: Session, image: bytes, lat: float | None, lon: float | None,
                  captured_at, source: str) -> schemas.MediaAnalyzeResponse:
    """`image` is already sanitized (re-encoded JPEG, no EXIF)."""
    if (lat is None) != (lon is None):
        raise ApiError("VALIDATION_ERROR", "Send both lat and lon, or neither",
                       {"fields": [{"field": "lat", "reason": "lat and lon go together"}]})
    if source == "camera" and lat is None:
        raise ApiError("VALIDATION_ERROR", "Camera frames must include lat and lon",
                       {"fields": [{"field": "lat", "reason": "required when source=camera"}]})
    meta = types.MediaMeta(lat=lat, lon=lon, captured_at=aware(captured_at).isoformat() if captured_at else None,
                           source=source)
    raw = call_ai("analyze_media", image, "image/jpeg", meta)
    detection = schemas.Detection.model_validate(raw.model_dump() if hasattr(raw, "model_dump") else raw)
    media = Media(source=source, mime="image/jpeg", data=image, phash=call_ai("phash", image),
                  lat=lat, lon=lon, captured_at=captured_at)
    session.add(media)
    session.flush()

    event = None
    # An event needs a place: an upload without location is analysed and stored, but opens no event.
    if detection.waste_score >= WASTE_THRESHOLD and lat is not None:
        event = Event(type="WASTE", severity=severity(detection.waste_score), waste_score=detection.waste_score,
                      summary=detection.summary[:1000], lat=lat, lon=lon, media_id=media.id)
        session.add(event)
        session.flush()
        maybe_create_for_event(session, event)
    session.commit()
    event_id, bounty_id = _links(session, event)
    return schemas.MediaAnalyzeResponse(media_id=media.id, analysis=detection, event_id=event_id, bounty_id=bounty_id)


def get_media(session: Session, media_id: str) -> Media:
    if (m := session.get(Media, media_id)) is None:
        raise ApiError("NOT_FOUND", "Image not found")
    return m


def list_events(session: Session, type_: str | None, limit: int) -> schemas.EventsResponse:
    q = (select(Event, Bounty.id).outerjoin(Bounty, Bounty.event_id == Event.id)
         .order_by(Event.created_at.desc()).limit(limit))
    if type_:
        q = q.where(Event.type == type_)
    return schemas.EventsResponse(items=[
        schemas.EventOut(id=e.id, type=e.type, severity=e.severity, waste_score=e.waste_score, summary=e.summary,
                         lat=e.lat, lon=e.lon, media_id=e.media_id, bounty_id=bid, created_at=e.created_at)
        for e, bid in session.execute(q)
    ])
