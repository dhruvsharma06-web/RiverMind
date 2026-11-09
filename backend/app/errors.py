import logging
from typing import Any, Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("rivermind")

ErrorCode = Literal[
    "VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "INVALID_STATE", "IDEMPOTENCY_CONFLICT",
    "PAYLOAD_TOO_LARGE", "BUDGET_EXCEEDED", "RATE_LIMITED", "INTERNAL", "PAYPAL_ERROR", "AI_UNAVAILABLE",
]
HTTP_STATUS: dict[str, int] = {
    "VALIDATION_ERROR": 422, "UNAUTHORIZED": 401, "FORBIDDEN": 403, "NOT_FOUND": 404, "INVALID_STATE": 409,
    "IDEMPOTENCY_CONFLICT": 409, "PAYLOAD_TOO_LARGE": 413, "BUDGET_EXCEEDED": 422, "RATE_LIMITED": 429,
    "INTERNAL": 500, "PAYPAL_ERROR": 502, "AI_UNAVAILABLE": 503,
}
# Starlette raises plain HTTP errors (unknown route, wrong method, ...); map them onto contract codes.
# 405 has no contract code, so a wrong method is reported as NOT_FOUND (keeping HTTP 405).
_CODE_FOR_STATUS = {401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 405: "NOT_FOUND",
                    413: "PAYLOAD_TOO_LARGE", 429: "RATE_LIMITED"}


class ErrorBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: ErrorCode
    message: str
    details: dict[str, Any]


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    error: ErrorBody


class ApiError(Exception):
    def __init__(self, code: ErrorCode, message: str, details: dict[str, Any] | None = None) -> None:
        self.code, self.message, self.details = code, message, details or {}


def error_json(code: str, message: str, details: dict | None = None, status: int | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status or HTTP_STATUS[code],
        content={"error": {"code": code, "message": message, "details": details or {}}},
    )


def error_responses(*codes: ErrorCode) -> dict[int, dict]:
    """`responses=` for a route, so OpenAPI shows the contract error shape."""
    return {HTTP_STATUS[c]: {"model": ErrorResponse} for c in ("INTERNAL", *codes)}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, exc: ApiError) -> JSONResponse:
        return error_json(exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [
            {"field": ".".join(str(p) for p in e["loc"] if p not in ("body", "query", "path", "header", "form")),
             "reason": e["msg"]}
            for e in exc.errors()
        ]
        return error_json("VALIDATION_ERROR", "Some fields are invalid", {"fields": fields})

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _CODE_FOR_STATUS.get(exc.status_code, "INTERNAL" if exc.status_code >= 500 else "VALIDATION_ERROR")
        message = exc.detail if isinstance(exc.detail, str) else "Request failed"
        return error_json(code, message, status=exc.status_code)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled error", exc_info=exc)
        return error_json("INTERNAL", "Something went wrong on our side")
