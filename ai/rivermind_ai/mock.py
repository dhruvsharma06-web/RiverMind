"""MOCK RiverAI (P2 S0.3): deterministic, no network, no model. Every output says model_version="mock-1".

What is mocked and what is real:
- analyze_media: waste_score comes from an image TEXTURE statistic, not a detector (flat water scores low,
  cluttered scenes score high). Counts and boxes are invented from that score. foam_ratio is the real HSV rule.
- detect_sensor_anomaly: flags turbidity above 2x the recent median.
- propose_bounty: amount = clamp(500 x severity, min, max).
- verify_cleanup: always PASSING per-check scores. The phashes are real, so the backend's duplicate check works.
- phash: real (imagehash).
- write_diary / draft_invoice: templates built only from the numbers they are given.
"""
import hashlib
import random
import statistics

from rivermind_ai import imaging
from rivermind_ai.schemas import (
    AnomalyResult,
    BountyProposal,
    Box,
    BudgetCtx,
    CountDrop,
    Counts,
    Detection,
    DiaryEntry,
    EventCtx,
    InvoiceDraft,
    LlmVote,
    Manipulation,
    MediaMeta,
    RiverStatusCtx,
    SceneMatch,
    SensorReading,
    VerificationScores,
    VerifyCtx,
)

VERSION = "mock-1"
TEXTURE_FULL = 24.0  # texture (0-255 scale) that maps to waste_score 1.0; recalibrate on fixtures/images
WASTE_THRESHOLD = 0.5  # same as the backend's event threshold
TURBIDITY_JUMP = 2.0  # mock anomaly rule: reading > 2x the median of the history
MIN_HISTORY = 3
CENTS_PER_SEVERITY = 500
INVOICE_ASK_CENTS = 10_000


def _usd(cents: int) -> str:
    return f"${cents / 100:,.2f}"


class MockRiverAI:
    def analyze_media(self, data: bytes, mime: str, meta: MediaMeta) -> Detection:
        img = imaging.open_rgb(data)
        score = round(min(1.0, imaging.texture(img) / TEXTURE_FULL), 2)
        foam = imaging.foam_ratio(img)
        detected = score >= WASTE_THRESHOLD
        total = round(14 * score) if detected else 0
        bottle, bag = round(total * 6 / 13), round(total * 3 / 13)
        counts = Counts(bottle=bottle, bag=bag, other=total - bottle - bag,
                        foam=int(foam > imaging.FOAM_COUNT_THRESHOLD))
        rng = random.Random(hashlib.sha256(data).digest())  # same image -> same boxes
        labels = ["bottle"] * counts.bottle + ["bag"] * counts.bag + ["other"] * counts.other
        boxes = []
        for cls in labels[:5]:
            x, y = rng.uniform(0.05, 0.85), rng.uniform(0.40, 0.85)
            w, h = rng.uniform(0.03, 0.10), rng.uniform(0.03, 0.10)
            boxes.append(Box(xyxy=[round(x, 3), round(y, 3), round(x + w, 3), round(y + h, 3)], cls=cls,
                             conf=round(0.5 + 0.4 * score, 2)))
        summary = (f"Mock detector: about {total} floating items (texture score {score:.2f})" if detected
                   else f"Mock detector: water looks clear (texture score {score:.2f})")
        return Detection(waste_detected=detected, waste_score=score, counts=counts, boxes=boxes, foam_ratio=foam,
                         summary=summary, confidence=round(min(1.0, 0.5 + abs(score - WASTE_THRESHOLD)), 2),
                         model_version=VERSION)

    def detect_sensor_anomaly(self, reading: SensorReading, history: list[SensorReading]) -> AnomalyResult:
        if len(history) < MIN_HISTORY:
            return AnomalyResult(anomaly=False, score=0.0, reason=f"Not enough history yet ({len(history)} readings)",
                                 method=VERSION)
        median = statistics.median(h.turbidity_ntu for h in history)
        ratio = reading.turbidity_ntu / max(median, 0.1)
        anomaly = ratio > TURBIDITY_JUMP
        return AnomalyResult(
            anomaly=anomaly, score=round(min(1.0, max(0.0, (ratio - 1) / 3)), 2),
            sensor="turbidity" if anomaly else None, method=VERSION,
            reason=(f"Turbidity {reading.turbidity_ntu:.1f} NTU is {ratio:.1f}x the recent median of "
                    f"{median:.1f} NTU (mock rule: above {TURBIDITY_JUMP:.0f}x)"),
        )

    def propose_bounty(self, event: EventCtx, budget: BudgetCtx) -> BountyProposal:
        amount = max(budget.min_cents, min(budget.max_cents, CENTS_PER_SEVERITY * event.severity))
        waste = event.type == "WASTE"
        return BountyProposal(
            post=True,
            title=("Floating waste clean-up" if waste else "Water-quality spike: check the outfall")
            + f" (severity {event.severity})",
            description=("Remove the floating waste within the marked radius. Take a before photo, clean up, "
                         "then take an after photo from the same spot."),
            amount_cents=amount, radius_m=150,
            urgency="high" if event.severity >= 4 else "med" if event.severity >= 2 else "low",
            rationale=(f"Mock agent: severity {event.severity} x {_usd(CENTS_PER_SEVERITY)}, kept inside the "
                       f"allowed range {_usd(budget.min_cents)}-{_usd(budget.max_cents)}."),
            model_version=VERSION,
        )

    def verify_cleanup(self, before: bytes, after: bytes, ctx: VerifyCtx) -> VerificationScores:
        return VerificationScores(
            scene_match=SceneMatch(passed=True, inliers=60),
            count_drop=CountDrop(passed=True, before_count=14, after_count=2),
            llm=LlmVote(passed=True, vote=0.9, notes="Mock vote: always passes"),
            manipulation=Manipulation(flagged=False),
            before_phash=self.phash(before), after_phash=self.phash(after),
            explanation="Mock scores (always passing); the backend computes the geo, time and duplicate checks.",
            model_version=VERSION,
        )

    def phash(self, data: bytes) -> str:
        return imaging.phash(data)

    def write_diary(self, status: RiverStatusCtx, recent: list[EventCtx]) -> DiaryEntry:
        mood = "worried" if status.trend == "worsening" else "grateful" if status.cleanups_7d else "hopeful"
        text = (f"I am the Yamuna. My health score is {status.health_score} out of 100 and my water is "
                f"{status.trend}. This week {status.events_7d} pollution events were spotted and "
                f"{status.cleanups_7d} cleanups were verified. {status.open_bounties} cleanup bounties are open, "
                f"{_usd(status.paid_cents)} has gone to the people who cleaned me and donors have given "
                f"{_usd(status.donated_cents)}.")
        return DiaryEntry(text=text, mood=mood, numbers_validated=True, model_version=VERSION)

    def draft_invoice(self, status: RiverStatusCtx, sponsor_email: str, max_cents: int) -> InvoiceDraft:
        amount = min(max_cents, INVOICE_ASK_CENTS)
        return InvoiceDraft(
            amount_cents=amount, description="RiverMind cleanup sponsorship for the Yamuna",
            rationale=(f"Mock agent: fixed ask of {_usd(amount)}. {status.open_bounties} bounties are open and "
                       f"{_usd(status.paid_cents)} has been paid to cleanup workers so far."),
        )
