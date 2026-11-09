"""Token checks. Every secret is compared as a sha256 digest with hmac.compare_digest (constant time)."""
import hashlib
import hmac
import secrets
from typing import Annotated

from fastapi import Header

from app.config import get_settings
from app.errors import ApiError, error_responses


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def token_matches(presented: str | None, stored_hash: str | None) -> bool:
    if not presented or not stored_hash:  # an empty token never matches, even sha256("")
        return False
    return hmac.compare_digest(sha256_hex(presented), stored_hash)


def new_claim_token() -> str:
    return "ct_" + secrets.token_urlsafe(24)


def require_council(authorization: Annotated[str | None, Header()] = None) -> None:
    key = get_settings().COUNCIL_API_KEY.get_secret_value()
    scheme, _, token = (authorization or "").partition(" ")
    if scheme != "Bearer" or not key or not token_matches(token, sha256_hex(key)):
        raise ApiError("UNAUTHORIZED", "Missing or invalid council key")


COUNCIL_ERRORS = error_responses("UNAUTHORIZED")
