"""Idempotency-Key (IK) endpoints: a repeat with the same key returns the stored response; the same key with a
different request is IDEMPOTENCY_CONFLICT. Only 2xx responses are stored, so a failed call can be retried."""
import hashlib
import json
import uuid
from collections.abc import Callable

from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import IdempotencyKey


def check_key(key: str | None) -> str:
    try:
        return str(uuid.UUID(key or ""))
    except ValueError:
        raise ApiError("VALIDATION_ERROR", "Idempotency-Key header must be a UUID",
                       {"fields": [{"field": "Idempotency-Key", "reason": "required UUID"}]}) from None


def run_once(session: Session, key: str | None, route: str, body: dict, run: Callable[[], BaseModel]) -> JSONResponse:
    key = check_key(key)
    req_hash = hashlib.sha256(json.dumps([route, body], sort_keys=True, default=str).encode()).hexdigest()

    def replay(row: IdempotencyKey) -> JSONResponse:
        if row.route != route or row.request_hash != req_hash:
            raise ApiError("IDEMPOTENCY_CONFLICT", "This Idempotency-Key was already used for a different request")
        return JSONResponse(row.response_body, status_code=row.status_code)

    if (row := session.get(IdempotencyKey, key)) is not None:
        return replay(row)
    content = run().model_dump(mode="json")
    try:
        session.add(IdempotencyKey(key=key, route=route, request_hash=req_hash, status_code=200, response_body=content))
        session.commit()
    except IntegrityError:  # a concurrent request with the same key stored first
        session.rollback()
        return replay(session.get(IdempotencyKey, key))
    return JSONResponse(content)
