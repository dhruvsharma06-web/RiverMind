from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Header, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app import schemas
from app.config import get_settings
from app.db import get_db
from app.errors import error_responses
from app.hardening import rate_limit
from app.services import images, sensing

router = APIRouter(prefix="/api/v1")
Db = Annotated[Session, Depends(get_db)]


@router.post("/readings", response_model=schemas.ReadingCreated,
             responses=error_responses("UNAUTHORIZED", "VALIDATION_ERROR"))
def post_reading(body: schemas.ReadingIn, db: Db,
                 x_device_token: Annotated[str | None, Header()] = None) -> schemas.ReadingCreated:
    return sensing.ingest_reading(db, body, x_device_token)


@router.get("/readings", response_model=schemas.ReadingsResponse, responses=error_responses("VALIDATION_ERROR"))
def get_readings(db: Db, device_id: Annotated[str | None, Query(max_length=64)] = None,
                 limit: Annotated[int, Query(ge=1, le=1000)] = 200) -> schemas.ReadingsResponse:
    return sensing.list_readings(db, device_id or get_settings().DEVICE_ID, limit)


@router.post("/media/analyze", response_model=schemas.MediaAnalyzeResponse, dependencies=[rate_limit("media", 20)],
             responses=error_responses("PAYLOAD_TOO_LARGE", "VALIDATION_ERROR", "AI_UNAVAILABLE", "RATE_LIMITED"))
def analyze(
    db: Db,
    file: Annotated[UploadFile, File()],
    lat: Annotated[float | None, Form(ge=-90, le=90)] = None,
    lon: Annotated[float | None, Form(ge=-180, le=180)] = None,
    captured_at: Annotated[datetime | None, Form()] = None,
    source: Annotated[Literal["camera", "upload"], Form()] = "upload",
) -> schemas.MediaAnalyzeResponse:
    image = images.sanitize(images.read_upload(file))
    return sensing.analyze_media(db, image, lat, lon, captured_at, source)


@router.get("/media/{media_id}", response_class=Response, responses=error_responses("NOT_FOUND"))
def get_media(media_id: str, db: Db) -> Response:
    m = sensing.get_media(db, media_id)
    return Response(m.data, media_type=m.mime, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/events", response_model=schemas.EventsResponse, responses=error_responses("VALIDATION_ERROR"))
def get_events(db: Db, type: Annotated[Literal["WASTE", "SENSOR_ANOMALY"] | None, Query()] = None,
               limit: Annotated[int, Query(ge=1, le=200)] = 50) -> schemas.EventsResponse:
    return sensing.list_events(db, type, limit)
