"""Donations through PayPal Orders v2. A capture is recorded once; capturing again returns the same donation."""
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app import schemas
from app.adapters.paypal_client import get_paypal
from app.errors import ApiError
from app.models import Donation, LedgerEntry, utcnow


def create_order(session: Session, body: schemas.DonationOrderIn, request_id: str) -> schemas.DonationOrderResponse:
    order_id = get_paypal().create_order(body.amount_cents, request_id)
    donor = body.donor_name.strip() if body.donor_name and body.donor_name.strip() else None
    d = Donation(paypal_order_id=order_id, amount_cents=body.amount_cents, status="CREATED", donor_name=donor)
    session.add(d)
    session.commit()
    return schemas.DonationOrderResponse(donation_id=d.id, order_id=order_id)


def _captured(d: Donation) -> schemas.DonationCaptureResponse:
    return schemas.DonationCaptureResponse(donation=schemas.DonationCaptured(
        id=d.id, amount_cents=d.amount_cents, currency=d.currency, status="CAPTURED", donor_name=d.donor_name,
        created_at=d.created_at))


def capture(session: Session, order_id: str) -> schemas.DonationCaptureResponse:
    d = session.scalar(select(Donation).where(Donation.paypal_order_id == order_id))
    if d is None:
        raise ApiError("NOT_FOUND", "Donation order not found")
    if d.status == "CAPTURED":
        return _captured(d)
    capture_id = get_paypal().capture_order(order_id, request_id=f"cap-{d.id}")  # same request id -> PayPal dedupes
    mark_captured(session, d, capture_id)
    return _captured(d)


def mark_captured(session: Session, d: Donation, capture_id: str) -> None:
    """CREATED -> CAPTURED once; only the request that flips the row writes the DONATION ledger entry."""
    done = session.execute(
        update(Donation).where(Donation.id == d.id, Donation.status == "CREATED")
        .values(status="CAPTURED", capture_id=capture_id, updated_at=utcnow())
        .execution_options(synchronize_session=False)
    ).rowcount == 1
    if done:  # only the request that flipped the row writes the ledger entry
        session.add(LedgerEntry(kind="DONATION", ref_type="donation", ref_id=d.id, amount_cents=d.amount_cents))
    session.commit()
    session.refresh(d)


def apply_capture_webhook(session: Session, resource: dict) -> None:
    """PAYMENT.CAPTURE.COMPLETED: records a capture the browser never reported back to us."""
    order_id = ((resource.get("supplementary_data") or {}).get("related_ids") or {}).get("order_id")
    d = session.scalar(select(Donation).where(Donation.paypal_order_id == order_id)) if order_id else None
    if d is not None and d.status == "CREATED" and resource.get("status") == "COMPLETED" and resource.get("id"):
        mark_captured(session, d, str(resource["id"])[:64])


def list_donations(session: Session, limit: int) -> schemas.DonationsResponse:
    rows = session.scalars(select(Donation).where(Donation.status == "CAPTURED")
                           .order_by(Donation.created_at.desc()).limit(limit))
    total = session.scalar(select(func.coalesce(func.sum(Donation.amount_cents), 0))
                           .where(Donation.status == "CAPTURED")) or 0
    return schemas.DonationsResponse(items=[schemas.DonationItem.model_validate(d) for d in rows], total_cents=total)
