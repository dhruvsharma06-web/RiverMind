"""Accounts and sessions. Everyone who registers is a worker; council users come only from the seed."""
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import schemas
from app.config import Settings
from app.errors import ApiError
from app.models import User, UserSession, utcnow
from app.security import (
    SESSION_TTL,
    hash_password,
    new_session_token,
    sha256_hex,
    verify_password,
)

# Verified against when the email is unknown, so a miss costs the same as a wrong password.
_DUMMY_HASH = hash_password("not-a-real-password")


def user_out(user: User) -> schemas.User:
    return schemas.User.model_validate(user)


def _start_session(session: Session, user: User) -> schemas.AuthResponse:
    token = new_session_token()
    now = utcnow()
    session.add(UserSession(user_id=user.id, token_hash=sha256_hex(token), created_at=now, expires_at=now + SESSION_TTL))
    session.commit()
    return schemas.AuthResponse(user=user_out(user), token=token)


def register(session: Session, body: schemas.RegisterIn) -> schemas.AuthResponse:
    email = body.email.strip().lower()
    taken = ApiError("VALIDATION_ERROR", "An account with this email already exists",
                     {"fields": [{"field": "email", "reason": "An account with this email already exists"}]})
    if session.scalar(select(User.id).where(User.email == email)):
        raise taken
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password), role="worker")
    session.add(user)
    try:
        session.flush()
    except IntegrityError:  # lost a race with the same email
        session.rollback()
        raise taken from None
    return _start_session(session, user)


def login(session: Session, body: schemas.LoginIn) -> schemas.AuthResponse:
    user = session.scalar(select(User).where(User.email == body.email.strip().lower()))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if user is None or not ok:
        raise ApiError("UNAUTHORIZED", "Invalid email or password")
    return _start_session(session, user)


def logout(session: Session, token: str) -> None:
    session.execute(delete(UserSession).where(UserSession.token_hash == sha256_hex(token)))
    session.commit()


def ensure_council_user(session: Session, settings: Settings) -> None:
    """Create or update the council user from COUNCIL_EMAIL + COUNCIL_PASSWORD (both must be set)."""
    email = settings.COUNCIL_EMAIL.get_secret_value().strip().lower()
    password = settings.COUNCIL_PASSWORD.get_secret_value()
    if not email or not password:
        return
    user = session.scalar(select(User).where(User.email == email))
    if user is None:
        session.add(User(email=email, name="Council", password_hash=hash_password(password), role="council"))
    elif user.role != "council" or not verify_password(password, user.password_hash):
        # Promotion or password change: end every session, so an earlier holder of this email loses access.
        user.role, user.password_hash = "council", hash_password(password)
        session.execute(delete(UserSession).where(UserSession.user_id == user.id))
    session.commit()
