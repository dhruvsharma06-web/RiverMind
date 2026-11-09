"""K1 hardening: body size caps, per-IP rate limits, security headers."""
import json
import threading
import time
from collections import deque

from fastapi import Depends, Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.errors import ApiError

MAX_JSON_BYTES = 64 * 1024
MAX_MULTIPART_BYTES = 2 * 8 * 1024 * 1024 + 256 * 1024  # proof = two 8 MB photos + form fields


def _error_body(code: str, message: str) -> bytes:
    return json.dumps({"error": {"code": code, "message": message, "details": {}}}).encode()


class _TooLarge(Exception):
    pass


class BodyLimitMiddleware:
    """413 PAYLOAD_TOO_LARGE before the body is parsed; also counts bytes when Content-Length is absent or lies."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope["headers"])
        multipart = headers.get(b"content-type", b"").startswith(b"multipart/form-data")
        limit = MAX_MULTIPART_BYTES if multipart else MAX_JSON_BYTES
        started = False

        async def reject() -> None:
            await send({"type": "http.response.start", "status": 413,
                        "headers": [(b"content-type", b"application/json")]})
            await send({"type": "http.response.body", "body": _error_body("PAYLOAD_TOO_LARGE", "Request body is too large")})

        declared = headers.get(b"content-length")
        if declared and declared.isdigit() and int(declared) > limit:
            await reject()
            return
        seen, rejected = 0, False

        async def counted() -> Message:
            nonlocal seen, rejected, started
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > limit:
                    # Answer now: frameworks may turn a read error into a 400, so we send the 413 ourselves.
                    if not started:
                        started = rejected = True
                        await reject()
                    raise _TooLarge
            return message

        async def tracked_send(message: Message) -> None:
            nonlocal started
            if rejected:
                return  # we already answered 413; drop whatever the app sends after the failed read
            started = started or message["type"] == "http.response.start"
            await send(message)

        try:
            await self.app(scope, counted, tracked_send)
        except _TooLarge:
            pass


SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"x-frame-options", b"DENY"),
]
API_CSP = (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'")
DOCS_PATHS = ("/docs", "/redoc")  # Swagger UI needs scripts, so it gets no strict CSP


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                h = message.setdefault("headers", [])
                h.extend(SECURITY_HEADERS)
                if not scope["path"].startswith(DOCS_PATHS):
                    h.append(API_CSP)
                if scope.get("scheme") == "https":  # deployed behind Render's TLS (uvicorn --proxy-headers)
                    h.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))
            await send(message)

        await self.app(scope, receive, with_headers)


# shortcut: in-memory, per-process sliding window; fine for one Render instance, use Redis if we scale out.
_hits: dict[tuple[str, str], deque] = {}
_lock = threading.Lock()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def rate_limit(bucket: str, per_minute: int):
    def check(request: Request) -> None:
        key, now = (bucket, client_ip(request)), time.monotonic()
        with _lock:
            q = _hits.setdefault(key, deque())
            while q and q[0] <= now - 60:
                q.popleft()
            if len(q) >= per_minute:
                raise ApiError("RATE_LIMITED", "Too many requests. Try again in a minute.")
            q.append(now)
            if len(_hits) > 10_000:  # drop idle IPs so the table cannot grow forever
                for k in [k for k, v in _hits.items() if not v]:
                    del _hits[k]

    return Depends(check)


def reset_rate_limits() -> None:
    with _lock:
        _hits.clear()
