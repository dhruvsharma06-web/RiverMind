"""Token checks. Every secret is compared as a sha256 digest with hmac.compare_digest (constant time)."""
import hashlib
import hmac
import secrets
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.errors import ApiError, error_responses
from app.models import User, UserSession, aware, utcnow

SESSION_TTL = timedelta(days=7)
SESSION_PREFIX = "st_"
SCRYPT_PARAMS = {"n": 2**14, "r": 8, "p": 1}


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def token_matches(presented: str | None, stored_hash: str | None) -> bool:
    if not presented or not stored_hash:  # an empty token never matches, even sha256("")
        return False
    return hmac.compare_digest(sha256_hex(presented), stored_hash)


def new_claim_token() -> str:
    return "ct_" + secrets.token_urlsafe(24)


def new_session_token() -> str:
    return SESSION_PREFIX + secrets.token_urlsafe(32)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **SCRYPT_PARAMS)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, hash_hex = stored.split("$")
        salt, expected = bytes.fromhex(salt_hex), bytes.fromhex(hash_hex)
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    digest = hashlib.scrypt(password.encode(), salt=salt, **SCRYPT_PARAMS)
    return hmac.compare_digest(digest, expected)


def bearer_token(authorization: str | None) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    return token if scheme == "Bearer" else ""


def session_user(db: Session, token: str) -> User | None:
    """The user behind a live (unexpired) session token, else None."""
    if not token.startswith(SESSION_PREFIX):
        return None
    stored = sha256_hex(token)
    row = db.scalar(select(UserSession).where(UserSession.token_hash == stored))
    if row is None or not token_matches(token, row.token_hash) or aware(row.expires_at) <= utcnow():
        return None
    return db.get(User, row.user_id)


def current_user(db: Annotated[Session, Depends(get_db)], authorization: Annotated[str | None, Header()] = None) -> User:
    user = session_user(db, bearer_token(authorization))
    if user is None:
        raise ApiError("UNAUTHORIZED", "Sign in required")
    return user


def require_council(db: Annotated[Session, Depends(get_db)],
                    authorization: Annotated[str | None, Header()] = None) -> None:
    """Council access: the COUNCIL_API_KEY bearer, or a session whose user has the council role."""
    key = get_settings().COUNCIL_API_KEY.get_secret_value()
    token = bearer_token(authorization)
    if token and key and token_matches(token, sha256_hex(key)):
        return
    user = session_user(db, token)
    if user is None:
        raise ApiError("UNAUTHORIZED", "Missing or invalid council key")
    if user.role != "council":
        raise ApiError("FORBIDDEN", "Council access required")


COUNCIL_ERRORS = error_responses("UNAUTHORIZED", "FORBIDDEN")
