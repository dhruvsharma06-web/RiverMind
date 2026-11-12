"""Real RiverAI (USE_MOCK_AI=false). Every method either returns a real result or raises AIUnavailable /
InvalidOutput, which the backend turns into an honest AI_UNAVAILABLE error — never a fake result.

- analyze_media, verify_cleanup: real/vision.py (YOLO11n v2 ONNX detector, ORB scene match, one vision-LLM call)
- detect_sensor_anomaly: real/anomaly.py (limits + robust z-score + IsolationForest)
- propose_bounty, write_diary, draft_invoice: real/agent.py (LLM text inside code-set limits, with fallbacks)
- phash: imaging.phash (local, free)
Heavy pieces (onnxruntime session, scikit-learn forest, HTTP clients) load on first use, never at import time.
Every method is safe to call from several threads at once on the same object (the backend uses up to 8).
"""
from rivermind_ai import imaging
from rivermind_ai.real import agent, anomaly, vision
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
        return vision.analyze_media(data, mime, meta)

    def detect_sensor_anomaly(self, reading: SensorReading, history: list[SensorReading]) -> AnomalyResult:
        return anomaly.detect(reading, history)

    def propose_bounty(self, event: EventCtx, budget: BudgetCtx) -> BountyProposal:
        return agent.propose_bounty(event, budget)

    def verify_cleanup(self, before: bytes, after: bytes, ctx: VerifyCtx) -> VerificationScores:
        return vision.verify_cleanup(before, after, ctx)

    def phash(self, data: bytes) -> str:
        return imaging.phash(data)

    def write_diary(self, status: RiverStatusCtx, recent: list[EventCtx]) -> DiaryEntry:
        return agent.write_diary(status, recent)

    def draft_invoice(self, status: RiverStatusCtx, sponsor_email: str, max_cents: int) -> InvoiceDraft:
        return agent.draft_invoice(status, sponsor_email, max_cents)
