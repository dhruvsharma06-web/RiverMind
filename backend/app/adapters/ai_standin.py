"""STAND-IN MOCK of P2's `rivermind_ai` package, used only while that package is not installed.

Shapes follow CONTRACT.md "AI adapter". Every result is labelled model_version="standin-mock" so it is never
mistaken for real AI output. Delete this file once `rivermind_ai` (with its own mock) is on main.
"""
import io
import statistics
from typing import Literal

import imagehash
from PIL import Image
from pydantic import BaseModel, ConfigDict

from app.schemas import Detection

VERSION = "standin-mock"


class _M(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MediaMeta(_M):
    lat: float | None = None
    lon: float | None = None
    captured_at: str | None = None
    source: Literal["camera", "upload"]


class SensorReading(_M):
    ts: str
    turbidity_ntu: float
    ph: float
    tds_ppm: float
    temp_c: float


class AnomalyResult(_M):
    anomaly: bool
    score: float
    sensor: str | None = None
    reason: str
    method: str


class EventCtx(_M):
    event_id: str
    type: Literal["WASTE", "SENSOR_ANOMALY"]
    severity: int
    waste_score: float
    summary: str
    lat: float
    lon: float
    created_at: str


class BudgetCtx(_M):
    available_cents: int
    min_cents: int
    max_cents: int
    daily_cap_cents: int
    spent_today_cents: int


class BountyProposal(_M):
    post: bool
    title: str
    description: str
    amount_cents: int
    radius_m: int
    urgency: Literal["low", "med", "high"]
    rationale: str
    model_version: str


class VerifyCtx(_M):
    bounty_id: str
    prior_phashes: list[str]


class _Passed(_M):
    passed: bool


class SceneMatch(_Passed):
    inliers: int


class CountDrop(_Passed):
    before_count: int
    after_count: int


class Llm(_Passed):
    vote: float
    notes: str


class Manipulation(_M):
    flagged: bool


class VerificationScores(_M):
    scene_match: SceneMatch
    count_drop: CountDrop
    llm: Llm
    manipulation: Manipulation
    before_phash: str
    after_phash: str
    explanation: str
    model_version: str


class RiverStatusCtx(_M):
    health_score: int
    trend: str
    open_bounties: int
    paid_cents: int
    donated_cents: int
    events_7d: int
    cleanups_7d: int


class DiaryEntry(_M):
    text: str
    mood: Literal["hopeful", "worried", "grateful"]
    numbers_validated: bool
    model_version: str


class InvoiceDraft(_M):
    amount_cents: int
    description: str
    rationale: str


class AIUnavailable(Exception):
    pass


class InvalidOutput(Exception):
    pass


class StandInMockAI:
    def analyze_media(self, data: bytes, mime: str, meta: MediaMeta) -> Detection:
        # Fixed "waste" answer (matches fixtures/media_analyze.ok.json); tests patch it for the clean case.
        return Detection(
            waste_detected=True, waste_score=0.78, counts={"bottle": 6, "bag": 3, "foam": 1, "other": 4},
            boxes=[{"xyxy": [0.12, 0.40, 0.18, 0.47], "cls": "bottle", "conf": 0.81}], foam_ratio=0.07,
            summary="Stand-in mock: floating bottles and bags", confidence=0.8, model_version=VERSION,
        )

    def detect_sensor_anomaly(self, reading: SensorReading, history: list[SensorReading]) -> AnomalyResult:
        if len(history) < 3:
            return AnomalyResult(anomaly=False, score=0.0, reason="not enough history", method=VERSION)
        base = statistics.median(h.turbidity_ntu for h in history) or 1.0
        ratio = reading.turbidity_ntu / base
        score = round(max(0.0, min(1.0, (ratio - 1) / 3)), 2)
        return AnomalyResult(
            anomaly=ratio >= 2, score=score, sensor="turbidity", method=VERSION,
            reason=f"Turbidity {reading.turbidity_ntu:.1f} NTU vs median {base:.1f} NTU (x{ratio:.1f})",
        )

    def propose_bounty(self, event: EventCtx, budget: BudgetCtx) -> BountyProposal:
        amount = budget.min_cents + (event.severity - 1) * (budget.max_cents - budget.min_cents) // 4
        return BountyProposal(
            post=True, title=f"Clean-up needed: {event.summary}"[:200],
            description="Remove floating waste within the marked radius and photograph before and after.",
            amount_cents=amount, radius_m=150, urgency="high" if event.severity >= 4 else "med",
            rationale=f"Stand-in mock: severity {event.severity} scaled into the allowed range.", model_version=VERSION,
        )

    def verify_cleanup(self, before: bytes, after: bytes, ctx: VerifyCtx) -> VerificationScores:
        return VerificationScores(
            scene_match=SceneMatch(passed=True, inliers=61),
            count_drop=CountDrop(passed=True, before_count=14, after_count=2),
            llm=Llm(passed=True, vote=0.9, notes="Stand-in mock vote"),
            manipulation=Manipulation(flagged=False),
            before_phash=self.phash(before), after_phash=self.phash(after),
            explanation="Stand-in mock scores; the backend computed geo, time and duplicate checks.",
            model_version=VERSION,
        )

    def phash(self, data: bytes) -> str:
        return str(imagehash.phash(Image.open(io.BytesIO(data))))

    def write_diary(self, status: RiverStatusCtx, recent: list[EventCtx]) -> DiaryEntry:
        return DiaryEntry(
            text=(f"I am the Yamuna. My health score is {status.health_score}. "
                  f"{status.open_bounties} cleanup bounties are open."),
            mood="hopeful", numbers_validated=True, model_version=VERSION,
        )

    def draft_invoice(self, status: RiverStatusCtx, sponsor_email: str, max_cents: int) -> InvoiceDraft:
        return InvoiceDraft(amount_cents=min(10000, max_cents), description="RiverMind cleanup sponsorship",
                            rationale="Stand-in mock: fixed $100 sponsorship ask.")
