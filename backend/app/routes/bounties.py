from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Header, Query, UploadFile
from sqlalchemy.orm import Session

from app import schemas
from app.db import get_db
from app.errors import error_responses
from app.hardening import rate_limit
from app.security import current_user
from app.services import bounties, images

router = APIRouter(prefix="/api/v1")
Db = Annotated[Session, Depends(get_db)]


@router.get("/bounties", response_model=schemas.BountiesResponse, responses=error_responses("VALIDATION_ERROR"))
def list_bounties(db: Db, status: Annotated[schemas.BountyStatus | None, Query()] = None,
                  limit: Annotated[int, Query(ge=1, le=200)] = 100) -> schemas.BountiesResponse:
    return schemas.BountiesResponse(items=bounties.list_bounties(db, status, limit))


@router.get("/bounties/{bounty_id}", response_model=schemas.Bounty, responses=error_responses("NOT_FOUND"))
def get_bounty(bounty_id: str, db: Db) -> schemas.Bounty:
    return bounties.bounty_out(db, bounties.get_bounty_fresh(db, bounty_id))


@router.post("/bounties/{bounty_id}/claim", response_model=schemas.ClaimResponse, dependencies=[rate_limit("claim", 10), Depends(current_user)],
             responses=error_responses("UNAUTHORIZED", "NOT_FOUND", "INVALID_STATE", "VALIDATION_ERROR", "RATE_LIMITED"))
def claim(bounty_id: str, body: schemas.ClaimIn, db: Db) -> schemas.ClaimResponse:
    return bounties.claim(db, bounty_id, body)


@router.post("/bounties/{bounty_id}/proof", response_model=schemas.ProofResponse, dependencies=[rate_limit("proof", 10), Depends(current_user)],
             responses=error_responses("UNAUTHORIZED", "NOT_FOUND", "INVALID_STATE", "PAYLOAD_TOO_LARGE",
                                       "VALIDATION_ERROR", "AI_UNAVAILABLE", "RATE_LIMITED"))
def proof(
    bounty_id: str,
    db: Db,
    before: Annotated[UploadFile, File()],
    after: Annotated[UploadFile, File()],
    lat: Annotated[float, Form(ge=-90, le=90)],
    lon: Annotated[float, Form(ge=-180, le=180)],
    before_captured_at: Annotated[datetime, Form()],
    after_captured_at: Annotated[datetime, Form()],
    x_claim_token: Annotated[str | None, Header()] = None,
) -> schemas.ProofResponse:
    before_img = images.sanitize(images.read_upload(before), "before")
    after_img = images.sanitize(images.read_upload(after), "after")
    return bounties.submit_proof(db, bounty_id, x_claim_token, before_img, after_img, lat, lon,
                                 before_captured_at, after_captured_at)
