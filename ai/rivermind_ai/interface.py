"""The RiverAI protocol from CONTRACT.md. The mock and the real adapter both implement it."""
from typing import Protocol, runtime_checkable

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


@runtime_checkable
class RiverAI(Protocol):
    def analyze_media(self, data: bytes, mime: str, meta: MediaMeta) -> Detection: ...

    def detect_sensor_anomaly(self, reading: SensorReading, history: list[SensorReading]) -> AnomalyResult: ...

    def propose_bounty(self, event: EventCtx, budget: BudgetCtx) -> BountyProposal: ...

    def verify_cleanup(self, before: bytes, after: bytes, ctx: VerifyCtx) -> VerificationScores: ...

    def phash(self, data: bytes) -> str: ...  # 16 hex chars

    def write_diary(self, status: RiverStatusCtx, recent: list[EventCtx]) -> DiaryEntry: ...

    def draft_invoice(self, status: RiverStatusCtx, sponsor_email: str, max_cents: int) -> InvoiceDraft: ...
