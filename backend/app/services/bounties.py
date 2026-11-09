"""Bounties: creation from an event (agent proposes, code decides), claim, proof + verification, and output."""
import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.adapters.ai_adapter import call_ai, types
from app.config import get_settings
from app.errors import ApiError
from app.geo import haversine_m
from app.models import (
    Bounty,
    Event,
    LedgerEntry,
    Media,
    Payout,
    Verification,
    aware,
    utcnow,
)
from app.security import new_claim_token, sha256_hex, token_matches
from app.services import bounty_fsm, budget, payouts, verify_policy

log = logging.getLogger("rivermind")
DEDUPE_RADIUS_M = 500
DEDUPE_WINDOW = timedelta(hours=6)


def _dump(obj) -> dict:
    return obj.model_dump() if hasattr(obj, "model_dump") else dict(obj)


# --- output ---
def bounty_out(session: Session, b: Bounty) -> schemas.Bounty:
    return bounties_out(session, [b])[0]


def bounties_out(session: Session, items: list[Bounty]) -> list[schemas.Bounty]:
    ids = [b.id for b in items]
    vers = {v.bounty_id: v for v in session.scalars(select(Verification).where(Verification.bounty_id.in_(ids)))}
    pays = {p.bounty_id: p for p in session.scalars(select(Payout).where(Payout.bounty_id.in_(ids)))}
    return [
        schemas.Bounty(
            id=b.id, event_id=b.event_id, title=b.title, description=b.description, amount_cents=b.amount_cents,
            currency=b.currency, status=b.status, lat=b.lat, lon=b.lon, radius_m=b.radius_m, expires_at=b.expires_at,
            urgency=b.urgency, agent_rationale=b.agent_rationale, worker_name=b.worker_name, claimed_at=b.claimed_at,
            rejection_reason=b.rejection_reason,
            verification=verification_out(vers[b.id]) if b.id in vers else None,
            payout=payouts.payout_out(pays[b.id]) if b.id in pays else None,
            created_at=b.created_at, updated_at=b.updated_at,
        )
        for b in items
    ]


def verification_out(v: Verification) -> schemas.Verification:
    return schemas.Verification(
        id=v.id, bounty_id=v.bounty_id, passed=v.passed, score=v.score, checks=v.checks, reasons=v.reasons,
        explanation=v.explanation, model_version=v.model_version, created_at=v.created_at,
    )


# --- reads ---
def get_bounty(session: Session, bounty_id: str) -> Bounty:
    if (b := session.get(Bounty, bounty_id)) is None:
        raise ApiError("NOT_FOUND", "Bounty not found")
    return b


def get_bounty_fresh(session: Session, bounty_id: str) -> Bounty:
    """GET /bounties/{id}: re-polls this bounty's payout if it is stuck in SENDING/SENT (CONTRACT "Payout safety")."""
    b = get_bounty(session, bounty_id)
    if (p := session.scalar(select(Payout).where(Payout.bounty_id == b.id))) is not None:
        payouts.refresh_stale(session, [p])
        session.refresh(b)
    return b


def list_bounties(session: Session, status: str | None, limit: int) -> list[schemas.Bounty]:
    q = select(Bounty).order_by(Bounty.created_at.desc()).limit(limit)
    if status:
        q = q.where(Bounty.status == status)
    return bounties_out(session, list(session.scalars(q)))


# --- creation ---
def maybe_create_for_event(session: Session, event: Event) -> Bounty | None:
    """Agent proposes; code decides. No bounty when: an open bounty is within 500 m from the last 6 h, the agent
    declines, the AI is down, or the budget refuses. The event stands either way. Caller commits."""
    settings, now = get_settings(), utcnow()
    recent = session.scalars(select(Bounty).where(
        Bounty.status.in_(bounty_fsm.OPEN_STATUSES), Bounty.created_at >= now - DEDUPE_WINDOW))
    if any(haversine_m(b.lat, b.lon, event.lat, event.lon) <= DEDUPE_RADIUS_M for b in recent):
        return None

    t, spent = budget.treasury(session), budget.spent_today(session, now)
    try:
        proposal = call_ai(
            "propose_bounty",
            types.EventCtx(event_id=event.id, type=event.type, severity=event.severity, waste_score=event.waste_score,
                           summary=event.summary, lat=event.lat, lon=event.lon,
                           created_at=aware(event.created_at).isoformat()),
            types.BudgetCtx(available_cents=t.available, min_cents=settings.MIN_BOUNTY_CENTS,
                            max_cents=settings.MAX_BOUNTY_CENTS, daily_cap_cents=settings.DAILY_CAP_CENTS,
                            spent_today_cents=spent),
        )
        if not proposal.post:
            return None
        amount = budget.validate(proposal.amount_cents, settings=settings, available=t.available,
                                 spent_today_cents=spent)
    except ApiError as exc:
        log.info("no bounty for event", extra={"fields": {"event_id": event.id, "why": exc.code}})
        return None

    bounty = Bounty(
        event_id=event.id, title=proposal.title[:200], description=proposal.description, amount_cents=amount,
        currency="USD", status="OPEN", lat=event.lat, lon=event.lon,
        radius_m=max(25, min(1000, proposal.radius_m)),  # AI output is bounded, never trusted
        expires_at=None, urgency=proposal.urgency, agent_rationale=proposal.rationale,
    )
    session.add(bounty)
    session.flush()
    session.add(LedgerEntry(kind="RESERVE", ref_type="bounty", ref_id=bounty.id, amount_cents=amount))
    return bounty


# --- worker actions ---
def claim(session: Session, bounty_id: str, body: schemas.ClaimIn) -> schemas.ClaimResponse:
    b = get_bounty(session, bounty_id)
    token = new_claim_token()
    bounty_fsm.transition(session, b, "claim", worker_name=body.worker_name.strip(), worker_email=body.paypal_email,
                          claim_token_hash=sha256_hex(token), claimed_at=utcnow())
    session.commit()
    return schemas.ClaimResponse(bounty=bounty_out(session, b), claim_token=token)


def submit_proof(session: Session, bounty_id: str, token: str | None, before: bytes, after: bytes,
                 lat: float, lon: float, before_at, after_at) -> schemas.ProofResponse:
    b = get_bounty(session, bounty_id)
    if not token_matches(token, b.claim_token_hash):
        raise ApiError("UNAUTHORIZED", "Missing or invalid claim token")
    if b.status != "CLAIMED":
        raise ApiError("INVALID_STATE", f"Bounty is {b.status}, not CLAIMED")

    prior = list(session.scalars(select(Media.phash).where(Media.source == "proof")))
    ai = _dump(call_ai("verify_cleanup", before, after, types.VerifyCtx(bounty_id=b.id, prior_phashes=prior)))
    passed, score, checks, reasons, rejection = verify_policy.decide(
        ai,
        geo=verify_policy.geo_check(b.lat, b.lon, b.radius_m, lat, lon),
        time=verify_policy.time_check(aware(before_at), aware(after_at), aware(b.claimed_at)),
        duplicate=verify_policy.duplicate_check(ai["before_phash"], ai["after_phash"], prior),
    )

    media = [Media(source="proof", mime="image/jpeg", data=data, phash=ph, lat=lat, lon=lon, captured_at=at)
             for data, ph, at in ((before, ai["before_phash"], before_at), (after, ai["after_phash"], after_at))]
    session.add_all(media)
    bounty_fsm.transition(session, b, "proof")
    session.flush()
    v = Verification(bounty_id=b.id, before_media_id=media[0].id, after_media_id=media[1].id, passed=passed,
                     score=score, checks=checks, reasons=reasons, explanation=ai["explanation"],
                     model_version=ai["model_version"])
    session.add(v)
    if passed:
        bounty_fsm.transition(session, b, "policy_pass")
    else:
        bounty_fsm.transition(session, b, "policy_fail", rejection_reason=rejection)
        session.add(LedgerEntry(kind="RELEASE", ref_type="bounty", ref_id=b.id, amount_cents=b.amount_cents))
    session.commit()

    if passed:
        try:
            payouts.start_for_verified(session, b)
        except ApiError as exc:  # verification stands; the payout is visible as SENDING and recoverable
            log.error("payout start failed after verification", extra={"fields": {"bounty_id": b.id, "code": exc.code}})
        session.refresh(b)
    return schemas.ProofResponse(bounty=bounty_out(session, b), verification=verification_out(v))
