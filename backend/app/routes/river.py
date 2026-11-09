from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.config import get_settings
from app.db import get_db
from app.errors import error_responses
from app.security import require_council
from app.seed import reset_demo
from app.services import river

router = APIRouter(prefix="/api/v1")
Db = Annotated[Session, Depends(get_db)]


@router.get("/river/status", response_model=schemas.RiverStatusResponse, responses=error_responses())
def river_status(db: Db) -> schemas.RiverStatusResponse:
    return river.status(db)


@router.get("/diary/latest", response_model=schemas.DiaryResponse, responses=error_responses("NOT_FOUND"))
def diary_latest(db: Db) -> schemas.DiaryResponse:
    return river.latest_diary(db)


@router.post("/demo/reset", response_model=schemas.ResetResponse, dependencies=[Depends(require_council)],
             responses=error_responses("UNAUTHORIZED"))
def demo_reset(db: Db) -> schemas.ResetResponse:
    reset_demo(db, get_settings())
    return schemas.ResetResponse(reset=True)
