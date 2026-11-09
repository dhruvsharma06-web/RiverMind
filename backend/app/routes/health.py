from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.errors import ApiError, error_responses
from app.schemas import HealthResponse

router = APIRouter(prefix="/api/v1")  # prefix here (not in include_router) so logs show the full route


@router.get("/health", response_model=HealthResponse, responses=error_responses())
def health(
    db: Annotated[Session, Depends(get_db)], settings: Annotated[Settings, Depends(get_settings)]
) -> HealthResponse:
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise ApiError("INTERNAL", "Database is not reachable") from exc
    return HealthResponse(status="ok", version="1.0", mock_ai=settings.USE_MOCK_AI,
                          paypal_mode=settings.PAYPAL_MODE, db="ok")
