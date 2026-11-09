"""Every contract fixture must parse and follow the basic contract rules.

Dhruv extends this in Stage 1 (e2e/test_contract.py) to validate fixtures against the backend OpenAPI schema.
"""
import json
import pathlib

import pytest

FIXTURES = pathlib.Path(__file__).resolve().parent.parent / "fixtures"
JSON_FILES = sorted(FIXTURES.glob("*.json"))
ERROR_CODES = {
    "VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "INVALID_STATE", "IDEMPOTENCY_CONFLICT",
    "PAYLOAD_TOO_LARGE", "BUDGET_EXCEEDED", "RATE_LIMITED", "INTERNAL", "PAYPAL_ERROR", "AI_UNAVAILABLE",
}


def walk(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield f"{path}.{k}", k, v
            yield from walk(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk(v, f"{path}[{i}]")


def test_fixtures_exist():
    assert len(JSON_FILES) >= 30


@pytest.mark.parametrize("path", JSON_FILES, ids=lambda p: p.name)
def test_fixture_parses_and_follows_conventions(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    for where, key, value in walk(data):
        if key.endswith("_cents"):
            assert isinstance(value, int) and not isinstance(value, bool), f"{where} must be integer cents"
        if key == "currency":
            assert value == "USD", f"{where} must be USD"
        if key in {"created_at", "updated_at", "ts", "expires_at", "claimed_at"} and value is not None:
            assert value.endswith("Z"), f"{where} must be ISO 8601 UTC"
    if path.name.startswith("error.") or path.name.endswith(".error.json"):
        assert set(data) == {"error"}
        assert data["error"]["code"] in ERROR_CODES
        assert set(data["error"]) == {"code", "message", "details"}
