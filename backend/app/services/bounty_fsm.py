"""Bounty state machine (CONTRACT "Bounty state machine"). Every status change goes through transition()."""
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import Bounty, utcnow

TRANSITIONS: dict[tuple[str, str], str] = {
    ("OPEN", "claim"): "CLAIMED",
    ("CLAIMED", "proof"): "PROOF_SUBMITTED",
    ("PROOF_SUBMITTED", "policy_pass"): "VERIFIED",
    ("PROOF_SUBMITTED", "policy_fail"): "REJECTED",
    ("VERIFIED", "needs_approval"): "PAYOUT_PENDING_APPROVAL",
    ("VERIFIED", "paid"): "PAID",
    ("PAYOUT_PENDING_APPROVAL", "paid"): "PAID",
    ("VERIFIED", "payout_failed"): "PAYOUT_FAILED",
    ("PAYOUT_PENDING_APPROVAL", "payout_failed"): "PAYOUT_FAILED",
    ("PAYOUT_PENDING_APPROVAL", "veto"): "REJECTED",
    ("PAYOUT_FAILED", "retry"): "VERIFIED",
}
OPEN_STATUSES = ("OPEN", "CLAIMED", "PROOF_SUBMITTED")  # "open bounty" for the 500 m / 6 h rule


def next_status(status: str, event: str) -> str | None:
    return TRANSITIONS.get((status, event))


def transition(session: Session, bounty: Bounty, event: str, **fields) -> Bounty:
    """Compare-and-set on (status, version). Losing a race, or an illegal move, raises INVALID_STATE.
    The caller commits."""
    target = next_status(bounty.status, event)
    if target is None:
        raise ApiError("INVALID_STATE", f"Bounty is {bounty.status}; cannot {event.replace('_', ' ')}")
    result = session.execute(
        update(Bounty)
        .where(Bounty.id == bounty.id, Bounty.status == bounty.status, Bounty.version == bounty.version)
        .values(status=target, version=bounty.version + 1, updated_at=utcnow(), **fields)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        session.rollback()
        raise ApiError("INVALID_STATE", "Bounty was changed by another request; reload and try again")
    session.refresh(bounty)
    return bounty
