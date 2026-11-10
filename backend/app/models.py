"""Database tables. Portable types only: the same models run on SQLite (local/CI) and Neon Postgres."""
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


def aware(dt: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes; everything we store is UTC."""
    return dt.replace(tzinfo=UTC) if dt is not None and dt.tzinfo is None else dt


def _id() -> Mapped[str]:
    return mapped_column(String(36), primary_key=True, default=new_id)


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


def _updated() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # e.g. "yamuna-okhla-01"
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # sha256 hex
    created_at: Mapped[datetime] = _created()


class Reading(Base):
    __tablename__ = "readings"
    __table_args__ = (UniqueConstraint("device_id", "seq"),)
    id: Mapped[str] = _id()
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"), nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    turbidity_ntu: Mapped[float] = mapped_column(Float, nullable=False)
    ph: Mapped[float] = mapped_column(Float, nullable=False)
    tds_ppm: Mapped[float] = mapped_column(Float, nullable=False)
    temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    simulated: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = _created()


class Media(Base):
    __tablename__ = "media"
    __table_args__ = (CheckConstraint("length(data) <= 1048576", name="media_max_1mb"),)
    id: Mapped[str] = _id()
    source: Mapped[str] = mapped_column(String(16), nullable=False, index=True)  # camera | upload | proof
    mime: Mapped[str] = mapped_column(String(32), nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)  # re-encoded, EXIF stripped
    phash: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (CheckConstraint("severity BETWEEN 1 AND 5", name="event_severity_1_5"),)
    id: Mapped[str] = _id()
    type: Mapped[str] = mapped_column(String(16), nullable=False)  # WASTE | SENSOR_ANOMALY
    severity: Mapped[int] = mapped_column(Integer, nullable=False)
    waste_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    media_id: Mapped[str | None] = mapped_column(ForeignKey("media.id"))
    reading_id: Mapped[str | None] = mapped_column(ForeignKey("readings.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class Bounty(Base):
    __tablename__ = "bounties"
    __table_args__ = (
        CheckConstraint("amount_cents > 0", name="bounty_amount_positive"),
        Index("ix_bounties_status_created_at", "status", "created_at"),
    )
    id: Mapped[str] = _id()
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="OPEN")
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    radius_m: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # null = never expires
    urgency: Mapped[str] = mapped_column(String(8), nullable=False)  # low | med | high
    agent_rationale: Mapped[str] = mapped_column(Text, nullable=False)
    worker_name: Mapped[str | None] = mapped_column(String(100))
    worker_email: Mapped[str | None] = mapped_column(String(254))  # never returned in full by the API
    claim_token_hash: Mapped[str | None] = mapped_column(String(64))
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  # optimistic locking (bounty_fsm)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class Verification(Base):
    __tablename__ = "verifications"
    id: Mapped[str] = _id()
    bounty_id: Mapped[str] = mapped_column(ForeignKey("bounties.id"), unique=True, nullable=False)
    before_media_id: Mapped[str] = mapped_column(ForeignKey("media.id"), nullable=False)
    after_media_id: Mapped[str] = mapped_column(ForeignKey("media.id"), nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    checks: Mapped[dict] = mapped_column(JSON, nullable=False)
    reasons: Mapped[list] = mapped_column(JSON, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = _created()


class Payout(Base):
    __tablename__ = "payouts"
    __table_args__ = (CheckConstraint("amount_cents > 0", name="payout_amount_positive"),)
    id: Mapped[str] = _id()
    bounty_id: Mapped[str] = mapped_column(ForeignKey("bounties.id"), unique=True, nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    receiver_email: Mapped[str] = mapped_column(String(254), nullable=False)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    sender_batch_id: Mapped[str | None] = mapped_column(String(64), unique=True)  # rm-{payout_id}-a{attempt}
    paypal_batch_id: Mapped[str | None] = mapped_column(String(64), index=True)  # webhook lookup
    paypal_item_id: Mapped[str | None] = mapped_column(String(64))
    last_polled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class Donation(Base):
    __tablename__ = "donations"
    __table_args__ = (CheckConstraint("amount_cents > 0", name="donation_amount_positive"),)
    id: Mapped[str] = _id()
    paypal_order_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    capture_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    status: Mapped[str] = mapped_column(String(16), nullable=False)  # CREATED | CAPTURED
    donor_name: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    updated_at: Mapped[datetime] = _updated()


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    __table_args__ = (
        UniqueConstraint("kind", "ref_type", "ref_id"),
        CheckConstraint("amount_cents > 0", name="ledger_amount_positive"),
    )
    id: Mapped[str] = _id()
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # SEED | DONATION | RESERVE | RELEASE | PAYOUT
    ref_type: Mapped[str] = mapped_column(String(16), nullable=False)
    ref_id: Mapped[str] = mapped_column(String(64), nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    created_at: Mapped[datetime] = _created()


class DiaryEntry(Base):
    __tablename__ = "diary_entries"
    id: Mapped[str] = _id()
    text: Mapped[str] = mapped_column(Text, nullable=False)
    mood: Mapped[str] = mapped_column(String(16), nullable=False)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class WebhookEvent(Base):
    __tablename__ = "webhook_events"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # PayPal event id: a repeat hits the PK
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    received_at: Mapped[datetime] = _created()


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    key: Mapped[str] = mapped_column(String(36), primary_key=True)
    route: Mapped[str] = mapped_column(String(128), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # same key + different body -> CONFLICT
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    response_body: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = _created()


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('worker', 'council')", name="user_role_valid"),)
    id: Mapped[str] = _id()
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)  # always lowercased
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)  # scrypt$<salt_hex>$<hash_hex>
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="worker")  # worker | council
    created_at: Mapped[datetime] = _created()


class UserSession(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = _id()
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)  # sha256 hex of "st_..."
    created_at: Mapped[datetime] = _created()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
