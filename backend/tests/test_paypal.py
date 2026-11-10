"""Real PayPal client against a fake PayPal (httpx.MockTransport), plus payout safety under failures."""
import json
import threading
import time
import uuid
from datetime import timedelta

import httpx
import pytest
from app.adapters import ai_adapter
from app.adapters.paypal_client import PayPalClient, cents_to_value
from app.adapters.paypal_mock import MockPayPal
from app.config import get_settings
from app.errors import ApiError
from app.models import LedgerEntry, Payout
from app.services import payouts
from sqlalchemy import func, select

from tests.conftest import COUNCIL, ai_impl
from tests.test_endpoints import API, IK, claim, err, make_bounty, proof, upload_waste


# --- the real client, against a fake PayPal ---
class FakePayPalServer:
    def __init__(self):
        self.calls: list[httpx.Request] = []
        self.routes = {}

    def on(self, method, path, *responses):
        self.routes[(method, path)] = list(responses)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        if request.url.path == "/v1/oauth2/token":
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 32400})
        queue = self.routes[(request.method, request.url.path)]
        r = queue.pop(0) if len(queue) > 1 else queue[0]
        if isinstance(r, Exception):
            raise r
        return r

    def api_calls(self, path):
        return [c for c in self.calls if c.url.path == path]


@pytest.fixture
def pp():
    server = FakePayPalServer()
    settings = get_settings().model_copy(update={"PAYPAL_WEBHOOK_ID": "WH-ID"})
    return server, PayPalClient(settings, transport=httpx.MockTransport(server), backoff_s=0)


def test_cents_to_value():
    assert [cents_to_value(c) for c in (1, 5, 99, 100, 1250, 100000)] == ["0.01", "0.05", "0.99", "1.00", "12.50",
                                                                          "1000.00"]
    with pytest.raises(ValueError):
        cents_to_value(0)


def test_token_is_cached_and_order_carries_request_id(pp):
    server, client = pp
    server.on("POST", "/v2/checkout/orders", httpx.Response(201, json={"id": "ORDER-1"}))
    assert client.create_order(1250, "req-1") == "ORDER-1"
    assert client.create_order(500, "req-2") == "ORDER-1"
    assert len(server.api_calls("/v1/oauth2/token")) == 1
    first = server.api_calls("/v2/checkout/orders")[0]
    assert first.headers["PayPal-Request-Id"] == "req-1" and first.headers["Authorization"] == "Bearer tok"
    assert json.loads(first.content)["purchase_units"][0]["amount"] == {"currency_code": "USD", "value": "12.50"}


def test_5xx_is_retried_then_paypal_error_without_leaking(pp):
    server, client = pp
    server.on("POST", "/v2/checkout/orders", httpx.Response(503, json={"name": "INTERNAL", "debug_id": "SECRETDBG"}))
    with pytest.raises(ApiError) as e:
        client.create_order(500, "req")
    assert e.value.code == "PAYPAL_ERROR" and "SECRETDBG" not in e.value.message
    assert len(server.api_calls("/v2/checkout/orders")) == 3


def test_network_error_then_success(pp):
    server, client = pp
    server.on("GET", "/v1/payments/payouts/B1", httpx.ConnectTimeout("slow"),
              httpx.Response(200, json={"items": [{"payout_item_id": "I1", "transaction_status": "SUCCESS"}]}))
    assert client.get_payout_batch("B1") == {"batch_id": "B1", "item_id": "I1", "item_status": "SUCCESS"}


def test_capture_paths(pp):
    server, client = pp
    done = {"purchase_units": [{"payments": {"captures": [{"id": "CAP-1", "status": "COMPLETED"}]}}]}
    server.on("POST", "/v2/checkout/orders/O1/capture", httpx.Response(201, json=done))
    assert client.capture_order("O1", "r") == "CAP-1"

    already = {"name": "UNPROCESSABLE_ENTITY", "details": [{"issue": "ORDER_ALREADY_CAPTURED"}]}
    server.on("POST", "/v2/checkout/orders/O2/capture", httpx.Response(422, json=already))
    server.on("GET", "/v2/checkout/orders/O2", httpx.Response(200, json=done))
    assert client.capture_order("O2", "r") == "CAP-1"

    not_ok = {"name": "UNPROCESSABLE_ENTITY", "details": [{"issue": "ORDER_NOT_APPROVED"}]}
    server.on("POST", "/v2/checkout/orders/O3/capture", httpx.Response(422, json=not_ok))
    with pytest.raises(ApiError) as e:
        client.capture_order("O3", "r")
    assert e.value.code == "INVALID_STATE"


def test_payout_uses_sender_batch_id_as_request_id(pp):
    server, client = pp
    server.on("POST", "/v1/payments/payouts", httpx.Response(201, json={"batch_header": {"payout_batch_id": "PB1"}}))
    assert client.send_payout("rm-x-a1", 1500, "w@example.com")["batch_id"] == "PB1"
    call = server.api_calls("/v1/payments/payouts")[0]
    body = json.loads(call.content)
    assert call.headers["PayPal-Request-Id"] == "rm-x-a1" == body["sender_batch_header"]["sender_batch_id"]
    assert body["items"][0]["amount"] == {"value": "15.00", "currency": "USD"}


def test_payout_resend_returns_the_original_batch(pp):
    """Exact sandbox reply to a repeated sender_batch_id (captured 10 Nov): no new payment, link to the original."""
    server, client = pp
    dup = {"name": "USER_BUSINESS_ERROR", "details": [{
        "field": "SENDER_BATCH_ID", "location": "body", "issue": "Batch with given sender_batch_id already exists",
        "link": [{"href": "https://api.sandbox.paypal.com/v1/payments/payouts/UE75CJXBPNDWG", "rel": "self",
                  "method": "GET", "encType": "application/json"}]}]}
    server.on("POST", "/v1/payments/payouts", httpx.Response(400, json=dup))
    assert client.send_payout("rm-x-a1", 1500, "w@example.com")["batch_id"] == "UE75CJXBPNDWG"

    server.on("POST", "/v1/payments/payouts", httpx.Response(400, json={"name": "VALIDATION_ERROR", "details": []}))
    with pytest.raises(ApiError):  # any other 400 is still an error
        client.send_payout("rm-x-a2", 1500, "w@example.com")


def test_webhook_event_forwarded_byte_for_byte(pp):
    server, client = pp
    server.on("POST", "/v1/notifications/verify-webhook-signature",
              httpx.Response(200, json={"verification_status": "SUCCESS"}))
    raw = b'{"id":"WH-1","amount":{"value":"1.0"},  "z":1}'  # odd spacing + "1.0" would change if re-serialised
    headers = {"PAYPAL-AUTH-ALGO": "a", "PAYPAL-CERT-URL": "c", "PAYPAL-TRANSMISSION-ID": "t",
               "PAYPAL-TRANSMISSION-SIG": "s", "PAYPAL-TRANSMISSION-TIME": "tt"}
    assert client.verify_webhook(headers, raw) is True
    sent = server.api_calls("/v1/notifications/verify-webhook-signature")[0].content
    assert sent.endswith(b'"webhook_event": ' + raw + b"}") and json.loads(sent)["webhook_id"] == "WH-ID"
    assert client.verify_webhook({}, raw) is False  # missing signature headers


# --- payout safety in the app ---
class FlakyPayPal(MockPayPal):
    """Mock that can fail the first send and report PENDING before SUCCESS."""

    def __init__(self, fail_sends=0, pending_polls=0):
        self.fail_sends, self.pending_polls, self.sent = fail_sends, pending_polls, []

    def send_payout(self, sender_batch_id, amount_cents, receiver):
        self.sent.append(sender_batch_id)
        if self.fail_sends:
            self.fail_sends -= 1
            raise ApiError("PAYPAL_ERROR", "PayPal could not complete the request. Please try again.")
        return {"batch_id": f"PB-{sender_batch_id}", "item_id": None, "item_status": None}

    def get_payout_batch(self, batch_id):
        status = "PENDING" if self.pending_polls else "SUCCESS"
        self.pending_polls = max(0, self.pending_polls - 1)
        return {"batch_id": batch_id, "item_id": f"{batch_id}-I", "item_status": status}


@pytest.fixture
def flaky(monkeypatch):
    def install(**kw):
        fake = FlakyPayPal(**kw)
        monkeypatch.setattr(payouts, "get_paypal", lambda: fake)
        monkeypatch.setattr(payouts, "POLL_INTERVAL_S", 0)
        return fake
    return install


def test_payout_polls_until_success(seeded, monkeypatch, flaky):
    fake = flaky(pending_polls=2)
    bid = make_bounty(seeded, amount=1500, monkeypatch=monkeypatch)
    body = proof(seeded, bid, claim(seeded, bid)).json()
    assert body["bounty"]["status"] == "PAID" and body["bounty"]["payout"]["paypal_item_id"].endswith("-I")
    assert len(fake.sent) == 1


def test_still_pending_after_3_polls_then_lazy_repoll(seeded, monkeypatch, flaky, db):
    flaky(pending_polls=4)
    bid = make_bounty(seeded, amount=1500, monkeypatch=monkeypatch)
    body = proof(seeded, bid, claim(seeded, bid)).json()
    assert body["bounty"]["status"] == "VERIFIED" and body["bounty"]["payout"]["status"] == "SENT"
    assert seeded.get(f"{API}/bounties/{bid}").json()["status"] == "VERIFIED"  # younger than 15 s: not re-polled

    monkeypatch.setattr(payouts, "STALE", timedelta(0))
    seeded.get(f"{API}/payouts")  # 4th poll: still PENDING
    assert seeded.get(f"{API}/bounties/{bid}").json()["status"] == "PAID"  # 5th poll: SUCCESS
    assert db.scalar(select(func.count()).select_from(LedgerEntry).where(LedgerEntry.kind == "PAYOUT")) == 1


def test_paypal_down_during_send_recovers_without_double_pay(seeded, monkeypatch, flaky, db):
    fake = flaky(fail_sends=1)
    bid = make_bounty(seeded, amount=2500, monkeypatch=monkeypatch)
    pid = proof(seeded, bid, claim(seeded, bid)).json()["bounty"]["payout"]["id"]
    err(seeded.post(f"{API}/payouts/{pid}/approve", json={}, headers=COUNCIL | IK()), 502, "PAYPAL_ERROR")
    assert db.get(Payout, pid).status == "SENDING"
    err(seeded.post(f"{API}/payouts/{pid}/approve", json={}, headers=COUNCIL | IK()), 409, "INVALID_STATE")

    monkeypatch.setattr(payouts, "STALE", timedelta(0))
    items = seeded.get(f"{API}/payouts").json()["items"]
    assert [i["status"] for i in items if i["id"] == pid] == ["SUCCEEDED"]
    assert fake.sent == [f"rm-{pid}-a1", f"rm-{pid}-a1"]  # recovery re-used the same id: PayPal de-duplicates
    assert seeded.get(f"{API}/bounties/{bid}").json()["status"] == "PAID"


def test_ai_timeout_is_503(seeded, monkeypatch):
    monkeypatch.setattr(ai_adapter, "AI_TIMEOUT_S", 0.05)
    monkeypatch.setattr(ai_impl(), "analyze_media", lambda self, *a: time.sleep(0.5))
    err(upload_waste(seeded), 503, "AI_UNAVAILABLE")


def test_two_concurrent_claims_one_wins(seeded):
    bid = seeded.get(f"{API}/bounties").json()["items"][0]["id"]
    results, gate = [], threading.Barrier(2)

    def go(name):
        gate.wait()
        results.append(seeded.post(f"{API}/bounties/{bid}/claim",
                                   json={"worker_name": name, "paypal_email": f"{name}@example.com"}).status_code)

    threads = [threading.Thread(target=go, args=(n,)) for n in ("ana", "ben")]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(results) == [200, 409]


def test_unknown_payout_404(seeded):
    err(seeded.post(f"{API}/payouts/{uuid.uuid4()}/approve", json={}, headers=COUNCIL | IK()), 404, "NOT_FOUND")


def test_sandbox_mode_without_credentials_refuses_to_start():
    with pytest.raises(ValueError):
        get_settings().__class__(_env_file=None, PAYPAL_MODE="sandbox", PAYPAL_CLIENT_ID="")
