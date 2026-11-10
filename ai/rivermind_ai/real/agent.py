"""Deterministic agent text (no LLM): bounty proposal, river diary, sponsor invoice. model_version "rules-v1".

Every number in the text comes from the inputs. The backend still clamps amounts and checks budget/caps.
"""
import re

from rivermind_ai.schemas import BountyProposal, BudgetCtx, DiaryEntry, EventCtx, InvoiceDraft, RiverStatusCtx

VERSION = "rules-v1"
INVOICE_SHARE = 0.5  # ask for half the allowed maximum


def _usd(cents: int) -> str:
    return f"${cents / 100:,.2f}"


def propose_bounty(event: EventCtx, budget: BudgetCtx) -> BountyProposal:
    # factor in [0.2, 1]: severity/5, scaled by waste_score for photo events (sensor events have waste_score 0)
    factor = event.severity / 5 * ((0.5 + 0.5 * event.waste_score) if event.type == "WASTE" else 1.0)
    lo, hi = budget.min_cents, max(budget.min_cents, budget.max_cents)
    amount = int(round((lo + factor * (hi - lo)) / 100) * 100)
    amount = max(lo, min(hi, amount))
    waste = event.type == "WASTE"
    urgency = "high" if event.severity >= 4 else "med" if event.severity >= 2 else "low"
    summary = event.summary.strip()[:300] or "No summary."
    return BountyProposal(
        post=True,
        title=("Floating waste clean-up" if waste else "Water-quality spike: check the outfall")
        + f" (severity {event.severity})",
        description=(f"{summary} " + ("Remove the floating waste within the marked radius. " if waste else
                                      "Find and report or clear the pollution source near the marker. ")
                     + "Take a before photo, clean up, then take an after photo from the same spot.")[:2000],
        amount_cents=amount, radius_m=150 if waste else 300, urgency=urgency,
        rationale=(f"Rule: min + (max - min) x severity {event.severity}/5"
                   + (f" x (0.5 + 0.5 x waste score {event.waste_score:.2f})" if waste else "")
                   + f" = {_usd(amount)}, inside {_usd(lo)}-{_usd(hi)}. The backend re-checks budget and caps."),
        model_version=VERSION,
    )


_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _numbers(text: str) -> set[str]:
    return {m.replace(",", "").rstrip(".") for m in _NUM.findall(text)}


def allowed_numbers(status: RiverStatusCtx, recent: list[EventCtx]) -> set[str]:
    vals: set[str] = {"100"}  # "out of 100"
    for c in (status.paid_cents, status.donated_cents):
        vals |= {str(c), f"{c / 100:.2f}", str(c // 100)}
    for v in (status.health_score, status.open_bounties, status.events_7d, status.cleanups_7d):
        vals.add(str(v))
    for e in recent:
        vals |= {str(e.severity)} | _numbers(e.summary)
    return vals


def numbers_ok(text: str, status: RiverStatusCtx, recent: list[EventCtx]) -> bool:
    """F10: every number in the text must appear in the inputs (cents may be written as dollars)."""
    return _numbers(text) <= allowed_numbers(status, recent)


def write_diary(status: RiverStatusCtx, recent: list[EventCtx]) -> DiaryEntry:
    mood = "worried" if status.trend == "worsening" else "grateful" if status.cleanups_7d else "hopeful"
    text = (f"I am the Yamuna. My health score is {status.health_score} out of 100 and my water is "
            f"{status.trend}. This week {status.events_7d} pollution events were spotted and "
            f"{status.cleanups_7d} cleanups were verified. {status.open_bounties} cleanup bounties are open, "
            f"{_usd(status.paid_cents)} has gone to the people who cleaned me and donors have given "
            f"{_usd(status.donated_cents)}.")
    if recent:
        e = recent[0]
        kind = "floating waste" if e.type == "WASTE" else "a water-quality spike"
        text += f" The latest report was {kind} at severity {e.severity}."
    return DiaryEntry(text=text, mood=mood, numbers_validated=numbers_ok(text, status, recent), model_version=VERSION)


def draft_invoice(status: RiverStatusCtx, sponsor_email: str, max_cents: int) -> InvoiceDraft:
    # sponsor_email is deliberately not used in the text and never logged
    amount = max(0, min(max_cents, int(round(max_cents * INVOICE_SHARE / 100) * 100)))
    return InvoiceDraft(
        amount_cents=amount, description="RiverMind cleanup sponsorship for the Yamuna",
        rationale=(f"Rule: half of the allowed maximum {_usd(max_cents)} = {_usd(amount)}. "
                   f"{status.open_bounties} bounties are open and {_usd(status.paid_cents)} has been paid to "
                   f"cleanup workers; {status.cleanups_7d} cleanups were verified this week."),
    )
