"""Response schemas, exactly as CONTRACT.md v1.0. extra="forbid" everywhere."""
from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field


def _as_utc(v: datetime) -> datetime:
    # SQLite returns naive datetimes; everything we store is UTC.
    return v.replace(tzinfo=UTC) if v.tzinfo is None else v.astimezone(UTC)


UtcDatetime = Annotated[datetime, AfterValidator(_as_utc)]
Cents = Annotated[int, Field(ge=0)]
Lat = Annotated[float, Field(ge=-90, le=90)]
Lon = Annotated[float, Field(ge=-180, le=180)]
Unit = Annotated[float, Field(ge=0, le=1)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


# --- shared objects ---
class GeoCheck(Strict):
    passed: bool
    distance_m: float
    source: Literal["browser", "exif", "none"]


class TimeCheck(Strict):
    passed: bool


class DuplicateCheck(Strict):
    passed: bool
    nearest_hamming: int


class SceneMatchCheck(Strict):
    passed: bool
    inliers: int


class CountDropCheck(Strict):
    passed: bool
    before_count: int
    after_count: int


class LlmCheck(Strict):
    passed: bool
    vote: Unit
    notes: str


class ManipulationCheck(Strict):
    flagged: bool


class SensorCheck(Strict):
    passed: bool | None
    turbidity_delta: float | None


class Checks(Strict):
    geo: GeoCheck
    time: TimeCheck
    duplicate: DuplicateCheck
    scene_match: SceneMatchCheck
    count_drop: CountDropCheck
    llm: LlmCheck
    manipulation: ManipulationCheck
    sensor: SensorCheck


class Verification(Strict):
    id: str
    bounty_id: str
    passed: bool
    score: Unit
    checks: Checks
    reasons: list[str]
    explanation: str
    model_version: str
    created_at: UtcDatetime


PayoutStatus = Literal["PENDING_APPROVAL", "QUEUED", "SENDING", "SENT", "SUCCEEDED", "FAILED", "VETOED"]


class Payout(Strict):
    id: str
    bounty_id: str
    amount_cents: Cents
    currency: Literal["USD"]
    status: PayoutStatus
    receiver_masked: str
    paypal_batch_id: str | None
    paypal_item_id: str | None
    created_at: UtcDatetime
    updated_at: UtcDatetime


BountyStatus = Literal[
    "OPEN", "CLAIMED", "PROOF_SUBMITTED", "VERIFIED", "REJECTED", "PAYOUT_PENDING_APPROVAL", "PAID", "PAYOUT_FAILED"
]


class Bounty(Strict):
    id: str
    event_id: str
    title: str
    description: str
    amount_cents: Cents
    currency: Literal["USD"]
    status: BountyStatus
    lat: Lat
    lon: Lon
    radius_m: int
    expires_at: UtcDatetime
    urgency: Literal["low", "med", "high"]
    agent_rationale: str
    worker_name: str | None
    claimed_at: UtcDatetime | None
    rejection_reason: str | None
    verification: Verification | None
    payout: Payout | None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class Counts(Strict):
    bottle: int
    bag: int
    foam: int
    other: int


class Box(Strict):
    xyxy: Annotated[list[Unit], Field(min_length=4, max_length=4)]
    cls: Literal["bottle", "bag", "other"]
    conf: Unit


class Detection(Strict):
    waste_detected: bool
    waste_score: Unit
    counts: Counts
    boxes: list[Box]
    foam_ratio: Unit
    summary: str
    confidence: Unit
    model_version: str


# --- endpoint responses ---
class HealthResponse(Strict):
    status: Literal["ok"]
    version: str
    mock_ai: bool
    paypal_mode: Literal["mock", "sandbox"]
    db: Literal["ok"]


class ReadingCreated(Strict):
    reading_id: str
    duplicate: bool
    event_id: str | None
    bounty_id: str | None


class ReadingOut(Strict):
    seq: int
    ts: UtcDatetime
    turbidity_ntu: float
    ph: float
    tds_ppm: float
    temp_c: float
    simulated: bool


class ReadingsResponse(Strict):
    items: list[ReadingOut]


class MediaAnalyzeResponse(Strict):
    media_id: str
    analysis: Detection
    event_id: str | None
    bounty_id: str | None


class EventOut(Strict):
    id: str
    type: Literal["WASTE", "SENSOR_ANOMALY"]
    severity: Annotated[int, Field(ge=1, le=5)]
    waste_score: Unit
    summary: str
    lat: Lat
    lon: Lon
    media_id: str | None
    bounty_id: str | None
    created_at: UtcDatetime


class EventsResponse(Strict):
    items: list[EventOut]


class BountiesResponse(Strict):
    items: list[Bounty]


class ClaimResponse(Strict):
    bounty: Bounty
    claim_token: str


class ProofResponse(Strict):
    bounty: Bounty
    verification: Verification


class PayoutTotals(Strict):
    paid_cents: Cents
    pending_cents: Cents


class PayoutsResponse(Strict):
    items: list[Payout]
    totals: PayoutTotals


class PayoutActionResponse(Strict):
    payout: Payout


class PayoutVetoResponse(Strict):
    payout: Payout
    bounty: Bounty


class DonationOrderResponse(Strict):
    donation_id: str
    order_id: str


class DonationCaptured(Strict):
    id: str
    amount_cents: Cents
    currency: Literal["USD"]
    status: Literal["CAPTURED"]
    donor_name: str | None
    created_at: UtcDatetime


class DonationCaptureResponse(Strict):
    donation: DonationCaptured


class DonationItem(Strict):
    id: str
    donor_name: str | None
    amount_cents: Cents
    currency: Literal["USD"]
    created_at: UtcDatetime


class DonationsResponse(Strict):
    items: list[DonationItem]
    total_cents: Cents


class Treasury(Strict):
    available_cents: Cents
    reserved_cents: Cents
    paid_cents: Cents
    donated_cents: Cents
    currency: Literal["USD"]


class RiverStatusResponse(Strict):
    river: str
    city: str
    health_score: Annotated[int, Field(ge=0, le=100)]
    trend: Literal["improving", "stable", "worsening"]
    latest_reading: ReadingOut | None
    open_bounties: int
    events_24h: int
    treasury: Treasury
    updated_at: UtcDatetime


class DiaryResponse(Strict):
    id: str
    text: str
    mood: Literal["hopeful", "worried", "grateful"]
    model_version: str
    created_at: UtcDatetime


class WebhookAck(Strict):
    received: Literal[True]


class FundraiseResponse(Strict):
    invoice_id: str
    amount_cents: Cents
    status: Literal["SENT"]
    agent_rationale: str


class ResetResponse(Strict):
    reset: Literal[True]
