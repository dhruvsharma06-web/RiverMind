"""Real RiverAI (USE_MOCK_AI=false). Built step by step in P2 S1-S4; anything not built yet raises AIUnavailable,
which the backend turns into an honest AI_UNAVAILABLE error instead of a fake result."""
from rivermind_ai import imaging
from rivermind_ai.errors import AIUnavailable
from rivermind_ai.real import anomaly
from rivermind_ai.schemas import (
    AnomalyResult,
    BountyProposal,
    BudgetCtx,
    Detection,
    DiaryEntry,
    EventCtx,
    InvoiceDraft,
    MediaMeta,
    RiverStatusCtx,
    SensorReading,
    VerificationScores,
    VerifyCtx,
)


def _not_built(feature: str) -> AIUnavailable:
    return AIUnavailable(f"real {feature} is not built yet")


class RealRiverAI:
    def analyze_media(self, data: bytes, mime: str, meta: MediaMeta) -> Detection:
        raise _not_built("analyze_media")

    def detect_sensor_anomaly(self, reading: SensorReading, history: list[SensorReading]) -> AnomalyResult:
        return anomaly.detect(reading, history)

    def propose_bounty(self, event: EventCtx, budget: BudgetCtx) -> BountyProposal:
        raise _not_built("propose_bounty")

    def verify_cleanup(self, before: bytes, after: bytes, ctx: VerifyCtx) -> VerificationScores:
        raise _not_built("verify_cleanup")

    def phash(self, data: bytes) -> str:
        return imaging.phash(data)

    def write_diary(self, status: RiverStatusCtx, recent: list[EventCtx]) -> DiaryEntry:
        raise _not_built("write_diary")

    def draft_invoice(self, status: RiverStatusCtx, sponsor_email: str, max_cents: int) -> InvoiceDraft:
        raise _not_built("draft_invoice")
