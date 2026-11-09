import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import schemas
from app.adapters.paypal_client import get_paypal
from app.db import get_db
from app.errors import ApiError, error_json, error_responses
from app.idempotency import check_key, run_once
from app.models import WebhookEvent
from app.security import require_council
from app.services import donations, payouts, river

log = logging.getLogger("rivermind")
router = APIRouter(prefix="/api/v1")
Db = Annotated[Session, Depends(get_db)]
IdemKey = Annotated[str | None, Header(alias="Idempotency-Key")]
Council = [Depends(require_council)]
COUNCIL_ACTION_ERRORS = error_responses("UNAUTHORIZED", "NOT_FOUND", "INVALID_STATE", "IDEMPOTENCY_CONFLICT",
                                        "PAYPAL_ERROR", "VALIDATION_ERROR")


@router.get("/payouts", response_model=schemas.PayoutsResponse, responses=error_responses("VALIDATION_ERROR"))
def list_payouts(db: Db, status: Annotated[schemas.PayoutStatus | None, Query()] = None,
                 limit: Annotated[int, Query(ge=1, le=200)] = 100) -> schemas.PayoutsResponse:
    return payouts.list_payouts(db, status, limit)


@router.post("/payouts/{payout_id}/approve", response_model=schemas.PayoutActionResponse,
             responses=COUNCIL_ACTION_ERRORS, dependencies=Council)
def approve(payout_id: str, db: Db, idempotency_key: IdemKey, body: schemas.ApproveIn | None = None):
    return run_once(db, idempotency_key, f"approve:{payout_id}", body.model_dump() if body else {},
                    lambda: payouts.approve(db, payout_id))


@router.post("/payouts/{payout_id}/veto", response_model=schemas.PayoutVetoResponse,
             responses=COUNCIL_ACTION_ERRORS, dependencies=Council)
def veto(payout_id: str, body: schemas.VetoIn, db: Db) -> schemas.PayoutVetoResponse:
    return payouts.veto(db, payout_id, body.reason)


@router.post("/payouts/{payout_id}/retry", response_model=schemas.PayoutActionResponse,
             responses=COUNCIL_ACTION_ERRORS, dependencies=Council)
def retry(payout_id: str, db: Db, idempotency_key: IdemKey):
    return run_once(db, idempotency_key, f"retry:{payout_id}", {}, lambda: payouts.retry(db, payout_id))


@router.post("/donations/orders", response_model=schemas.DonationOrderResponse,
             responses=error_responses("VALIDATION_ERROR", "IDEMPOTENCY_CONFLICT", "PAYPAL_ERROR"))
def create_donation_order(body: schemas.DonationOrderIn, db: Db, idempotency_key: IdemKey):
    key = check_key(idempotency_key)
    return run_once(db, key, "donation_order", body.model_dump(), lambda: donations.create_order(db, body, key))


@router.post("/donations/orders/{order_id}/capture", response_model=schemas.DonationCaptureResponse,
             responses=error_responses("NOT_FOUND", "INVALID_STATE", "PAYPAL_ERROR"))
def capture_donation(order_id: str, db: Db) -> schemas.DonationCaptureResponse:
    return donations.capture(db, order_id)


@router.get("/donations", response_model=schemas.DonationsResponse, responses=error_responses("VALIDATION_ERROR"))
def list_donations(db: Db, limit: Annotated[int, Query(ge=1, le=100)] = 20) -> schemas.DonationsResponse:
    return donations.list_donations(db, limit)


@router.post("/webhooks/paypal", response_model=schemas.WebhookAck, responses=error_responses("VALIDATION_ERROR"))
async def paypal_webhook(request: Request, db: Db):
    raw = await request.body()
    try:
        body = json.loads(raw)
        event_id, event_type = str(body["id"])[:64], str(body.get("event_type", ""))[:64]
    except (ValueError, KeyError, TypeError):
        return error_json("VALIDATION_ERROR", "Not a PayPal webhook event", status=400)
    try:
        verified = get_paypal().verify_webhook(dict(request.headers), raw)
    except ApiError:
        verified = False
    if not verified:
        return error_json("UNAUTHORIZED", "Webhook signature is not valid", status=400)
    try:
        db.add(WebhookEvent(id=event_id, event_type=event_type))
        db.commit()
    except IntegrityError:  # already seen: acknowledge, do nothing
        db.rollback()
        return JSONResponse({"received": True})
    # shortcut: payout/capture status updates from webhooks arrive in S3.5; polling covers them until then.
    log.info("webhook stored", extra={"fields": {"event_type": event_type}})
    return JSONResponse({"received": True})


@router.post("/agent/fundraise", response_model=schemas.FundraiseResponse, dependencies=Council,
             responses=error_responses("UNAUTHORIZED", "BUDGET_EXCEEDED", "PAYPAL_ERROR", "VALIDATION_ERROR",
                                       "AI_UNAVAILABLE"))
def fundraise(body: schemas.FundraiseIn, db: Db) -> schemas.FundraiseResponse:
    return river.fundraise(db, body)
