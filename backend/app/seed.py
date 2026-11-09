"""Demo seed, exactly as CONTRACT /demo/reset. Run by hand with: python -m app.seed"""
from datetime import timedelta

from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import Base
from app.geo import haversine_m
from app.models import Bounty, Device, DiaryEntry, Event, LedgerEntry, new_id, utcnow
from app.security import sha256_hex

# Position of DEVICE_ID as used in CONTRACT.md's reading example (Okhla). Readings are wiped by reset,
# so this is the only device position known at seed time.
DEVICE_REF = (28.5355, 77.3100)
MIN_DISTANCE_M = 2000
# Yamuna points in Delhi, far from Okhla. The first two that clear 2 km from device and camera are used.
CANDIDATES = [
    ("Wazirabad barrage", 28.7120, 77.2310),
    ("ITO bridge", 28.6270, 77.2610),
    ("Nizamuddin bridge", 28.5900, 77.2650),
    ("Palla", 28.8250, 77.2200),
]


def pick_points(settings: Settings) -> list[tuple[str, float, float]]:
    avoid = [DEVICE_REF]
    if settings.CAMERA_LAT is not None and settings.CAMERA_LON is not None:
        avoid.append((settings.CAMERA_LAT, settings.CAMERA_LON))
    ok = [c for c in CANDIDATES if all(haversine_m(c[1], c[2], a, b) >= MIN_DISTANCE_M for a, b in avoid)]
    if len(ok) < 2:
        raise RuntimeError("seed: fewer than 2 seed points are 2 km away from the device and the camera")
    return ok[:2]


def reset_demo(session: Session, settings: Settings) -> None:
    for table in reversed(Base.metadata.sorted_tables):
        session.execute(table.delete())

    now = utcnow()
    (waste_name, wlat, wlon), (sensor_name, slat, slon) = pick_points(settings)
    session.add(Device(id=settings.DEVICE_ID, token_hash=sha256_hex(settings.DEVICE_TOKEN.get_secret_value())))
    session.add(LedgerEntry(kind="SEED", ref_type="seed", ref_id="seed", amount_cents=settings.SEED_TREASURY_CENTS))

    # Severities follow the contract formula: WASTE ceil(5 x 0.62) = 4; SENSOR_ANOMALY ceil(5 x 0.5) = 3.
    waste = Event(id=new_id(), type="WASTE", severity=4, waste_score=0.62, lat=wlat, lon=wlon,
                  summary=f"Seed data: floating plastic reported near {waste_name}", created_at=now)
    sensor = Event(id=new_id(), type="SENSOR_ANOMALY", severity=3, waste_score=0.0, lat=slat, lon=slon,
                   summary=f"Seed data: turbidity spike reported near {sensor_name}", created_at=now)
    session.add_all([waste, sensor])
    session.flush()

    amount = max(settings.MIN_BOUNTY_CENTS, min(settings.MAX_BOUNTY_CENTS, 1000))
    bounty = Bounty(
        id=new_id(), event_id=waste.id, title=f"Seed data: clear floating plastic at {waste_name}",
        description="Demo bounty from the seed. Remove floating waste within 150 m and photograph before and after.",
        amount_cents=amount, currency="USD", status="OPEN", lat=wlat, lon=wlon, radius_m=150,
        expires_at=now + timedelta(hours=24), urgency="med",
        agent_rationale="Seed data: created by /demo/reset, not by the agent.",
    )
    session.add(bounty)
    session.add(LedgerEntry(kind="RESERVE", ref_type="bounty", ref_id=bounty.id, amount_cents=amount))

    available = settings.SEED_TREASURY_CENTS - amount
    session.add(DiaryEntry(
        mood="hopeful", model_version="seed",
        text=(f"I am the Yamuna. My treasury holds ${available / 100:.2f} after setting aside "
              f"${amount / 100:.2f} for 1 open cleanup bounty. 2 problems were reported today."),
    ))
    session.commit()


if __name__ == "__main__":
    from app.db import SessionLocal

    with SessionLocal() as s:
        reset_demo(s, get_settings())
    print("seeded")
