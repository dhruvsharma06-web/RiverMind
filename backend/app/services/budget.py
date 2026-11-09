"""Budget rules (CONTRACT "Budget rules"). Treasury numbers come from the ledger only.

Ledger kinds: SEED and DONATION add money; RESERVE holds money for an open bounty; RELEASE gives a reserve back
(rejection/veto); PAYOUT moves a reserve to paid. So reserved = RESERVE - RELEASE - PAYOUT and paid = PAYOUT.
"""
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.errors import ApiError
from app.models import LedgerEntry


@dataclass(frozen=True)
class Treasury:
    seed: int
    donated: int
    reserved: int
    paid: int

    @property
    def available(self) -> int:
        return self.seed + self.donated - self.reserved - self.paid


def treasury(session: Session) -> Treasury:
    sums = dict(session.execute(
        select(LedgerEntry.kind, func.coalesce(func.sum(LedgerEntry.amount_cents), 0)).group_by(LedgerEntry.kind)
    ).all())
    paid = sums.get("PAYOUT", 0)
    return Treasury(seed=sums.get("SEED", 0), donated=sums.get("DONATION", 0), paid=paid,
                    reserved=sums.get("RESERVE", 0) - sums.get("RELEASE", 0) - paid)


def spent_today(session: Session, now: datetime) -> int:
    """Money committed to bounties since 00:00 UTC (reserves made today), checked against DAILY_CAP_CENTS."""
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return session.scalar(select(func.coalesce(func.sum(LedgerEntry.amount_cents), 0)).where(
        LedgerEntry.kind == "RESERVE", LedgerEntry.created_at >= midnight)) or 0


def validate(proposed_cents: int, *, settings: Settings, available: int, spent_today_cents: int) -> int:
    """Clamp the agent's amount to [MIN, MAX]; refuse it if the treasury or today's cap cannot cover it."""
    amount = max(settings.MIN_BOUNTY_CENTS, min(settings.MAX_BOUNTY_CENTS, proposed_cents))
    if amount > available:
        raise ApiError("BUDGET_EXCEEDED", "The river's treasury cannot cover this amount",
                       {"amount_cents": amount, "available_cents": available})
    if spent_today_cents + amount > settings.DAILY_CAP_CENTS:
        raise ApiError("BUDGET_EXCEEDED", "This would pass the river's daily spending cap",
                       {"amount_cents": amount, "spent_today_cents": spent_today_cents,
                        "daily_cap_cents": settings.DAILY_CAP_CENTS})
    return amount
