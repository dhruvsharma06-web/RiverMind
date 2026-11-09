"""Payout lifecycle (CONTRACT "Payout safety"). One payout per bounty; only the request that wins the
QUEUED -> SENDING compare-and-set (committed before the HTTP call) talks to PayPal."""
import logging

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app import schemas
from app.adapters.paypal_client import get_paypal
from app.config import get_settings
from app.errors import ApiError
from app.models import Bounty, LedgerEntry, Payout, utcnow
from app.services import bounty_fsm

log = logging.getLogger("rivermind")
FAILED_ITEM = {"UNCLAIMED", "RETURNED", "BLOCKED", "FAILED"}
PENDING = ("PENDING_APPROVAL", "QUEUED", "SENDING", "SENT")


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    return f"{local[:2]}***@{domain}"


def payout_out(p: Payout) -> schemas.Payout:
    return schemas.Payout(
        id=p.id, bounty_id=p.bounty_id, amount_cents=p.amount_cents, currency=p.currency, status=p.status,
        receiver_masked=mask_email(p.receiver_email), paypal_batch_id=p.paypal_batch_id,
        paypal_item_id=p.paypal_item_id, created_at=p.created_at, updated_at=p.updated_at,
    )


def _cas(session: Session, p: Payout, expected: str, **values) -> None:
    """Compare-and-set on payout (status, version); the caller commits."""
    result = session.execute(
        update(Payout).where(Payout.id == p.id, Payout.status == expected, Payout.version == p.version)
        .values(version=p.version + 1, updated_at=utcnow(), **values)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        session.rollback()
        raise ApiError("INVALID_STATE", f"Payout is not {expected}")
    session.refresh(p)


def get_payout(session: Session, payout_id: str) -> Payout:
    if (p := session.get(Payout, payout_id)) is None:
        raise ApiError("NOT_FOUND", "Payout not found")
    return p


def start_for_verified(session: Session, bounty: Bounty) -> Payout:
    """Called once a bounty is VERIFIED: hold for the council above the threshold, otherwise send now."""
    needs_council = bounty.amount_cents > get_settings().COUNCIL_THRESHOLD_CENTS
    p = Payout(bounty_id=bounty.id, amount_cents=bounty.amount_cents, receiver_email=bounty.worker_email,
               status="PENDING_APPROVAL" if needs_council else "QUEUED")
    session.add(p)
    if needs_council:
        bounty_fsm.transition(session, bounty, "needs_approval")
    session.commit()
    if not needs_council:
        send(session, p)
    return p


def send(session: Session, p: Payout) -> Payout:
    sender_batch_id = f"rm-{p.id}-a{p.attempt}"
    _cas(session, p, "QUEUED", status="SENDING", sender_batch_id=sender_batch_id)
    session.commit()  # the claim on this payout is durable before PayPal is called
    try:
        result = get_paypal().send_payout(sender_batch_id, p.amount_cents, p.receiver_email)
    except ApiError:
        # Stay SENDING: PayPal may have accepted the batch. Recovery is a lookup by sender_batch_id (S2.3), never a resend.
        log.error("payout send failed", extra={"fields": {"payout_id": p.id}})
        raise
    _cas(session, p, "SENDING", status="SENT", paypal_batch_id=result["batch_id"], paypal_item_id=result.get("item_id"))
    apply_item_status(session, p, result.get("item_status"))
    session.commit()
    return p


def apply_item_status(session: Session, p: Payout, item_status: str | None) -> None:
    """Map a PayPal payout item status onto payout + bounty. PENDING/ONHOLD/unknown: stay SENT. Caller commits."""
    bounty = session.get(Bounty, p.bounty_id)
    if item_status == "SUCCESS":
        _cas(session, p, "SENT", status="SUCCEEDED")
        bounty_fsm.transition(session, bounty, "paid")
        session.add(LedgerEntry(kind="PAYOUT", ref_type="bounty", ref_id=bounty.id, amount_cents=p.amount_cents))
    elif item_status in FAILED_ITEM:
        _cas(session, p, "SENT", status="FAILED")
        bounty_fsm.transition(session, bounty, "payout_failed")


def approve(session: Session, payout_id: str) -> schemas.PayoutActionResponse:
    p = get_payout(session, payout_id)
    _cas(session, p, "PENDING_APPROVAL", status="QUEUED")
    session.commit()
    return schemas.PayoutActionResponse(payout=payout_out(send(session, p)))


def veto(session: Session, payout_id: str, reason: str) -> schemas.PayoutVetoResponse:
    from app.services.bounties import (
        bounty_out,  # local import: bounties imports this module
    )

    p = get_payout(session, payout_id)
    _cas(session, p, "PENDING_APPROVAL", status="VETOED")
    bounty = session.get(Bounty, p.bounty_id)
    bounty_fsm.transition(session, bounty, "veto", rejection_reason="COUNCIL_VETO")
    session.add(LedgerEntry(kind="RELEASE", ref_type="bounty", ref_id=bounty.id, amount_cents=bounty.amount_cents))
    session.commit()
    log.info("payout vetoed", extra={"fields": {"payout_id": p.id, "reason": reason[:200]}})
    return schemas.PayoutVetoResponse(payout=payout_out(p), bounty=bounty_out(session, bounty))


def retry(session: Session, payout_id: str) -> schemas.PayoutActionResponse:
    p = get_payout(session, payout_id)
    _cas(session, p, "FAILED", status="QUEUED", attempt=p.attempt + 1)
    bounty_fsm.transition(session, session.get(Bounty, p.bounty_id), "retry")
    session.commit()
    return schemas.PayoutActionResponse(payout=payout_out(send(session, p)))


def list_payouts(session: Session, status: str | None, limit: int) -> schemas.PayoutsResponse:
    q = select(Payout).order_by(Payout.created_at.desc()).limit(limit)
    if status:
        q = q.where(Payout.status == status)

    def total(*statuses: str) -> int:
        return session.scalar(select(func.coalesce(func.sum(Payout.amount_cents), 0))
                              .where(Payout.status.in_(statuses))) or 0

    return schemas.PayoutsResponse(
        items=[payout_out(p) for p in session.scalars(q)],
        totals=schemas.PayoutTotals(paid_cents=total("SUCCEEDED"), pending_cents=total(*PENDING)),
    )
