"""Payout lifecycle (CONTRACT "Payout safety"). One payout per bounty; only the request that wins the
QUEUED -> SENDING compare-and-set (committed before the HTTP call) talks to PayPal."""
import logging
import time
from datetime import timedelta

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app import schemas
from app.adapters.paypal_client import get_paypal
from app.config import get_settings
from app.errors import ApiError
from app.models import Bounty, LedgerEntry, Payout, aware, utcnow
from app.services import bounty_fsm

log = logging.getLogger("rivermind")
FAILED_ITEM = {"UNCLAIMED", "RETURNED", "BLOCKED", "FAILED"}
FINAL_ITEM = FAILED_ITEM | {"SUCCESS"}
POLL_TRIES, POLL_INTERVAL_S = 3, 2.0
STALE = timedelta(seconds=15)
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
    _cas(session, p, "QUEUED", status="SENDING", sender_batch_id=f"rm-{p.id}-a{p.attempt}")
    session.commit()  # only the request that won QUEUED -> SENDING reaches PayPal
    return _post_batch(session, p)


def _post_batch(session: Session, p: Payout) -> Payout:
    """POST the batch (sender_batch_id is also the PayPal-Request-Id, so a repeat returns the same batch),
    then poll it. On a PayPal error the payout stays SENDING and is recovered later with the same ids."""
    try:
        result = get_paypal().send_payout(p.sender_batch_id, p.amount_cents, p.receiver_email)
    except ApiError:
        log.error("payout send failed; stays SENDING for recovery", extra={"fields": {"payout_id": p.id}})
        raise
    _cas(session, p, "SENDING", status="SENT", paypal_batch_id=result["batch_id"], paypal_item_id=result.get("item_id"))
    session.commit()
    status = result.get("item_status")
    for _ in range(POLL_TRIES):
        if status in FINAL_ITEM:
            break
        time.sleep(POLL_INTERVAL_S)
        batch = get_paypal().get_payout_batch(p.paypal_batch_id)
        status = batch["item_status"]
        if batch.get("item_id") and not p.paypal_item_id:
            p.paypal_item_id = batch["item_id"]
    apply_item_status(session, p, status)
    session.commit()
    return p


def refresh_stale(session: Session, items: list[Payout]) -> None:
    """Lazy re-poll inside reads: SENT payouts older than 15 s are polled, and SENDING ones (a crash or PayPal error
    between our claim and PayPal's answer) are re-posted with the SAME ids, which PayPal de-duplicates. Each payout
    is touched at most once per 15 s; errors are logged and never fail the read."""
    now = utcnow()
    for p in items:
        if p.status not in ("SENDING", "SENT") or aware(p.updated_at) > now - STALE:
            continue
        won = session.execute(
            update(Payout).where(Payout.id == p.id, or_(Payout.last_polled_at.is_(None),
                                                        Payout.last_polled_at < now - STALE))
            .values(last_polled_at=now).execution_options(synchronize_session=False)
        ).rowcount == 1
        session.commit()
        if not won:
            continue
        session.refresh(p)
        try:
            if p.status == "SENDING":
                _post_batch(session, p)
            else:
                batch = get_paypal().get_payout_batch(p.paypal_batch_id)
                if batch.get("item_id") and not p.paypal_item_id:
                    p.paypal_item_id = batch["item_id"]
                apply_item_status(session, p, batch["item_status"])
                session.commit()
        except ApiError as exc:
            session.rollback()
            log.warning("payout re-poll failed", extra={"fields": {"payout_id": p.id, "code": exc.code}})


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
    refresh_stale(session, list(session.scalars(select(Payout).where(Payout.status.in_(("SENDING", "SENT"))).limit(50))))
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
