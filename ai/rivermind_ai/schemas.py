"""Every model in CONTRACT.md "AI adapter" plus the shared Detection object. Pydantic v2, unknown fields rejected.

Field names, types and ranges must match CONTRACT.md exactly: the backend re-validates Detection with its own schema.
"""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Unit = Annotated[float, Field(ge=0, le=1)]
PHash = Annotated[str, Field(pattern=r"^[0-9a-f]{16}$")]
Count = Annotated[int, Field(ge=0)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- inputs (built by the backend) ---
class MediaMeta(_Strict):
    lat: float | None = None
    lon: float | None = None
    captured_at: str | None = None
    source: Literal["camera", "upload"]


class SensorReading(_Strict):
    ts: str
    turbidity_ntu: float
    ph: float
    tds_ppm: float
    temp_c: float


class EventCtx(_Strict):
    event_id: str
    type: Literal["WASTE", "SENSOR_ANOMALY"]
    severity: Annotated[int, Field(ge=1, le=5)]
    waste_score: Unit
    summary: str
    lat: float
    lon: float
    created_at: str


class BudgetCtx(_Strict):
    available_cents: int
    min_cents: int
    max_cents: int
    daily_cap_cents: int
    spent_today_cents: int


class VerifyCtx(_Strict):
    bounty_id: str
    prior_phashes: list[str]


class RiverStatusCtx(_Strict):
    health_score: int
    trend: Literal["improving", "stable", "worsening"]
    open_bounties: int
    paid_cents: int
    donated_cents: int
    events_7d: int
    cleanups_7d: int


# --- outputs ---
class Counts(_Strict):
    bottle: Count
    bag: Count
    foam: Annotated[int, Field(ge=0, le=1)]
    other: Count


class Box(_Strict):
    xyxy: Annotated[list[Unit], Field(min_length=4, max_length=4)]  # normalised 0-1 relative to the image
    cls: Literal["bottle", "bag", "other"]
    conf: Unit


class Detection(_Strict):
    waste_detected: bool
    waste_score: Unit
    counts: Counts
    boxes: list[Box]
    foam_ratio: Unit
    summary: str
    confidence: Unit
    model_version: str


class AnomalyResult(_Strict):
    anomaly: bool
    score: Unit
    sensor: str | None = None
    reason: str
    method: str


class BountyProposal(_Strict):
    post: bool
    title: Annotated[str, Field(min_length=1, max_length=200)]
    description: Annotated[str, Field(min_length=1, max_length=2000)]
    amount_cents: int
    radius_m: int
    urgency: Literal["low", "med", "high"]
    rationale: Annotated[str, Field(min_length=1, max_length=1000)]
    model_version: str


class SceneMatch(_Strict):
    passed: bool
    inliers: Count


class CountDrop(_Strict):
    passed: bool
    before_count: Count
    after_count: Count


class LlmVote(_Strict):
    passed: bool
    vote: Unit
    notes: str


class Manipulation(_Strict):
    flagged: bool


class VerificationScores(_Strict):
    """Per-check results only. The overall pass/fail and score are computed by the backend, never here."""

    scene_match: SceneMatch
    count_drop: CountDrop
    llm: LlmVote
    manipulation: Manipulation
    before_phash: PHash
    after_phash: PHash
    explanation: str
    model_version: str


class DiaryEntry(_Strict):
    text: Annotated[str, Field(min_length=1, max_length=2000)]
    mood: Literal["hopeful", "worried", "grateful"]
    numbers_validated: bool
    model_version: str


class InvoiceDraft(_Strict):
    amount_cents: int
    description: Annotated[str, Field(min_length=1, max_length=1000)]
    rationale: Annotated[str, Field(min_length=1, max_length=1000)]
