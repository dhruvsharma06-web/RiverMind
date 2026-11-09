"""River status, diary and the agent's fundraising invoice."""
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import schemas
from app.adapters.ai_adapter import call_ai, types
from app.adapters.paypal_client import get_paypal
from app.config import get_settings
from app.errors import ApiError
from app.models import Bounty, DiaryEntry, Event, Reading, utcnow
from app.services import bounty_fsm, budget


def _severity_sum(session: Session, start, end) -> int:
    return session.scalar(select(func.coalesce(func.sum(Event.severity), 0))
                          .where(Event.created_at >= start, Event.created_at < end)) or 0


def status(session: Session) -> schemas.RiverStatusResponse:
    now = utcnow()
    last_24h = _severity_sum(session, now - timedelta(hours=24), now)
    prev_24h = _severity_sum(session, now - timedelta(hours=48), now - timedelta(hours=24))
    open_bounties = session.scalar(select(func.count()).select_from(Bounty)
                                   .where(Bounty.status.in_(bounty_fsm.OPEN_STATUSES))) or 0
    events_24h = session.scalar(select(func.count()).select_from(Event)
                                .where(Event.created_at >= now - timedelta(hours=24))) or 0
    # health = 100 - 3 x (sum of event severities in the last 24 h, max 60 off) - 5 x open bounties (max 20 off)
    health = max(0, min(100, 100 - min(60, 3 * last_24h) - min(20, 5 * open_bounties)))
    trend = "improving" if last_24h < prev_24h else "worsening" if last_24h > prev_24h else "stable"
    latest = session.scalar(select(Reading).order_by(Reading.ts.desc()).limit(1))
    t = budget.treasury(session)
    return schemas.RiverStatusResponse(
        river="Yamuna", city="Delhi", health_score=health, trend=trend,
        latest_reading=schemas.ReadingOut.model_validate(latest) if latest else None,
        open_bounties=open_bounties, events_24h=events_24h,
        treasury=schemas.Treasury(available_cents=max(0, t.available), reserved_cents=t.reserved, paid_cents=t.paid,
                                  donated_cents=t.donated, currency="USD"),
        updated_at=now,
    )


def latest_diary(session: Session) -> schemas.DiaryResponse:
    d = session.scalar(select(DiaryEntry).order_by(DiaryEntry.created_at.desc()).limit(1))
    if d is None:
        raise ApiError("NOT_FOUND", "No diary entry yet")
    return schemas.DiaryResponse.model_validate(d)


def status_ctx(session: Session):
    s, now = status(session), utcnow()
    week = now - timedelta(days=7)
    return types.RiverStatusCtx(
        health_score=s.health_score, trend=s.trend, open_bounties=s.open_bounties, paid_cents=s.treasury.paid_cents,
        donated_cents=s.treasury.donated_cents,
        events_7d=session.scalar(select(func.count()).select_from(Event).where(Event.created_at >= week)) or 0,
        cleanups_7d=session.scalar(select(func.count()).select_from(Bounty)
                                   .where(Bounty.status == "PAID", Bounty.updated_at >= week)) or 0,
    )


def fundraise(session: Session, body: schemas.FundraiseIn) -> schemas.FundraiseResponse:
    cap = get_settings().MAX_INVOICE_CENTS
    draft = call_ai("draft_invoice", status_ctx(session), body.sponsor_email, cap)
    amount = min(draft.amount_cents, cap)  # the agent drafts; code caps
    if amount <= 0:
        raise ApiError("BUDGET_EXCEEDED", "The drafted invoice amount is not valid")
    invoice_id = get_paypal().send_invoice(amount, body.sponsor_email, draft.description)
    return schemas.FundraiseResponse(invoice_id=invoice_id, amount_cents=amount, status="SENT",
                                     agent_rationale=draft.rationale)
