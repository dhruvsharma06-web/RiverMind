"""S4: body limits, rate limits, security headers, AI cost cap, log hygiene, load sanity, F14 toolkit invoices."""
import io
import json
import logging
import threading

import pytest
from app.adapters import ai_adapter
from app.adapters.paypal_client import PayPalClient
from app.config import get_settings
from app.errors import ApiError

from tests.conftest import COUNCIL, DEVICE, jpeg
from tests.test_endpoints import (
    API,
    SPOT,
    claim,
    err,
    make_bounty,
    proof,
    reading,
    upload_waste,
)


# --- S4.1 body limits ---
def test_json_body_over_64kb_rejected(seeded):
    big = json.dumps({"worker_name": "A" * 70_000, "paypal_email": "a@b.co"})
    r = seeded.post(f"{API}/bounties/x/claim", content=big, headers={"Content-Type": "application/json"})
    err(r, 413, "PAYLOAD_TOO_LARGE")


def test_body_without_content_length_is_still_counted(seeded):
    def chunks():
        for _ in range(20):
            yield b"x" * 4096  # 80 KB, streamed with no Content-Length

    r = seeded.post(f"{API}/bounties/x/claim", content=chunks(), headers={"Content-Type": "application/json"})
    err(r, 413, "PAYLOAD_TOO_LARGE")


# --- S4.1 rate limits ---
def test_media_rate_limit_20_per_minute(seeded):
    codes = [upload_waste(seeded, lat=SPOT[0] + i * 0.01, seed=i).status_code for i in range(21)]
    assert codes[:20] == [200] * 20
    err(upload_waste(seeded, seed=99), 429, "RATE_LIMITED")


def test_claim_rate_limit(seeded):
    for _ in range(10):
        seeded.post(f"{API}/bounties/nope/claim", json={"worker_name": "A", "paypal_email": "a@b.co"})
    err(seeded.post(f"{API}/bounties/nope/claim", json={"worker_name": "A", "paypal_email": "a@b.co"}),
        429, "RATE_LIMITED")


def test_council_rate_limit_applies_before_auth(client):
    for _ in range(30):
        client.post(f"{API}/demo/reset", headers={"Authorization": "Bearer guess"})
    err(client.post(f"{API}/demo/reset", headers=COUNCIL), 429, "RATE_LIMITED")  # key guessing is throttled


# --- S4.1 headers ---
def test_security_headers(client):
    h = client.get(f"{API}/health").headers
    assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "no-referrer" and "default-src 'none'" in h["content-security-policy"]
    assert "strict-transport-security" not in h  # plain http in tests; added behind TLS
    docs = client.get("/docs").headers
    assert "content-security-policy" not in docs and docs["x-content-type-options"] == "nosniff"


# --- K1 AI cost cap ---
def test_ai_daily_cap(seeded, monkeypatch):
    ai_adapter._usage.update(day=None, calls=0)  # the reset in `seeded` already wrote an AI diary
    monkeypatch.setattr(ai_adapter, "AI_DAILY_CALL_CAP", 1)
    assert upload_waste(seeded).status_code == 200  # analyze_media = 1 paid call (+ free phash); propose -> over cap
    err(upload_waste(seeded, seed=2), 503, "AI_UNAVAILABLE")


# --- S4.2 log hygiene ---
def test_logs_hold_no_secrets_or_full_emails(seeded, monkeypatch):
    from app.observability import JsonFormatter

    buf = io.StringIO()
    handler = logging.StreamHandler(buf)
    handler.setFormatter(JsonFormatter())
    root, old_level = logging.getLogger(), logging.getLogger().level
    root.addHandler(handler)
    root.setLevel(logging.INFO)  # an earlier alembic test may have raised it to WARN
    seeded.post(f"{API}/readings", json=reading(1), headers=DEVICE)
    bid = make_bounty(seeded, amount=2500, monkeypatch=monkeypatch)
    token = claim(seeded, bid, email="secret.worker@example.com")
    pid = proof(seeded, bid, token).json()["bounty"]["payout"]["id"]
    seeded.post(f"{API}/payouts/{pid}/veto", json={"reason": "test"}, headers=COUNCIL)
    root.removeHandler(handler)
    root.setLevel(old_level)
    out = buf.getvalue()
    assert '"route": "/api/v1/bounties/{bounty_id}/claim"' in out  # templated route, no ids
    for secret in (token, "secret.worker@example.com", "test-council-key", "test-device-token"):
        assert secret not in out


# --- S4.3 load sanity ---
def test_20_concurrent_uploads_do_not_crash(seeded):
    results, gate = [], threading.Barrier(20)

    def go(i):
        gate.wait()
        results.append(upload_waste(seeded, lat=SPOT[0] + i * 0.01, seed=i).status_code)

    threads = [threading.Thread(target=go, args=(i,)) for i in range(20)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(results) == [200] * 20


# --- S4.4 F14 through the Agent Toolkit ---
@pytest.fixture
def toolkit_calls(monkeypatch):
    toolkit_api = pytest.importorskip("paypal_agent_toolkit.shared.api")  # CI may not install the toolkit

    calls = []

    def fake_run(self, method, params):
        calls.append((method, params, self._context.sandbox))
        if method == "create_invoice":
            return json.dumps({"rel": "self", "href": "https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-AB12-CD34-EF56-GH78"})
        return json.dumps({})

    monkeypatch.setattr(toolkit_api.PayPalAPI, "run", fake_run)
    return calls


def test_toolkit_invoice_create_then_send(toolkit_calls):
    client = PayPalClient(get_settings())
    assert client.send_invoice(10000, "csr@example.com", "Sponsor a week of cleanups") == "INV2-AB12-CD34-EF56-GH78"
    (m1, create, sandbox), (m2, send, _) = toolkit_calls
    assert (m1, m2, sandbox) == ("create_invoice", "send_invoice", True)
    assert create["items"][0]["unit_amount"] == {"currency_code": "USD", "value": "100.00"}
    assert create["primary_recipients"][0]["billing_info"]["email_address"] == "csr@example.com"
    assert send == {"invoice_id": "INV2-AB12-CD34-EF56-GH78", "send_to_recipient": True}


def test_toolkit_failure_is_paypal_error(monkeypatch):
    toolkit_api = pytest.importorskip("paypal_agent_toolkit.shared.api")

    def boom(self, method, params):
        raise RuntimeError("Failed to obtain access token from PayPal")

    monkeypatch.setattr(toolkit_api.PayPalAPI, "run", boom)
    with pytest.raises(ApiError) as e:
        PayPalClient(get_settings()).send_invoice(500, "a@b.co", "x")
    assert e.value.code == "PAYPAL_ERROR"


def test_jpeg_helper_differs():
    assert jpeg(1) != jpeg(2)
