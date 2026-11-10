"""Real RiverAI (USE_MOCK_AI=false). No LLM is called yet: the detector is the shipped ONNX model, verification uses
ORB + detector counts with a deterministic proxy vote, and bounty/diary/invoice text is rule-based ("rules-v1").
Every output's model_version names the path that produced it."""
from rivermind_ai import imaging
from rivermind_ai.real import agent, anomaly, detector, verify
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


class RealRiverAI:
    def analyze_media(self, data: bytes, mime: str, meta: MediaMeta) -> Detection:
        return detector.analyze(data)

    def detect_sensor_anomaly(self, reading: SensorReading, history: list[SensorReading]) -> AnomalyResult:
        return anomaly.detect(reading, history)

    def propose_bounty(self, event: EventCtx, budget: BudgetCtx) -> BountyProposal:
        return agent.propose_bounty(event, budget)

    def verify_cleanup(self, before: bytes, after: bytes, ctx: VerifyCtx) -> VerificationScores:
        return verify.verify(before, after, ctx)

    def phash(self, data: bytes) -> str:
        return imaging.phash(data)

    def write_diary(self, status: RiverStatusCtx, recent: list[EventCtx]) -> DiaryEntry:
        return agent.write_diary(status, recent)

    def draft_invoice(self, status: RiverStatusCtx, sponsor_email: str, max_cents: int) -> InvoiceDraft:
        return agent.draft_invoice(status, sponsor_email, max_cents)
