"""PayPal access. The ONLY place cents become PayPal's "12.50" strings.

Real sandbox client: OAuth token cached until expiry, 15 s timeouts, retries (with backoff) only for idempotent
calls: GETs and POSTs that carry a PayPal-Request-Id. Provider errors become PAYPAL_ERROR; PayPal's payload
is logged (debug_id) but never returned to clients.
"""
import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

import httpx

from app.adapters.paypal_mock import MockPayPal
from app.config import Settings, get_settings
from app.errors import ApiError

log = logging.getLogger("rivermind")
SANDBOX = "https://api-m.sandbox.paypal.com"
TIMEOUT_S = 15
RETRIES = 3
RETRY_STATUSES = {429, 500, 502, 503, 504}
_toolkit_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="pp-toolkit")


def cents_to_value(cents: int) -> str:
    if cents <= 0:
        raise ValueError("amount must be positive")
    return f"{cents // 100}.{cents % 100:02d}"


def _fail(message: str = "PayPal could not complete the request. Please try again.") -> ApiError:
    return ApiError("PAYPAL_ERROR", message)


class PayPalClient:
    mode = "sandbox"

    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None, backoff_s: float = 0.5):
        self._id = settings.PAYPAL_CLIENT_ID
        self._secret = settings.PAYPAL_CLIENT_SECRET.get_secret_value()
        self._webhook_id = settings.PAYPAL_WEBHOOK_ID
        self._http = httpx.Client(base_url=SANDBOX, timeout=TIMEOUT_S, transport=transport)
        self._backoff = backoff_s
        self._token: str | None = None
        self._token_expires = 0.0
        self._lock = threading.Lock()

    # --- plumbing ---
    def _access_token(self, force: bool = False) -> str:
        with self._lock:
            if force or not self._token or time.monotonic() >= self._token_expires:
                r = self._send("POST", "/v1/oauth2/token", data={"grant_type": "client_credentials"},
                               auth=(self._id, self._secret), idempotent=True, authed=False)
                body = r.json()
                self._token = body["access_token"]
                self._token_expires = time.monotonic() + max(0, int(body.get("expires_in", 0)) - 60)
            return self._token

    def _send(self, method: str, path: str, *, idempotent: bool, authed: bool = True, **kw) -> httpx.Response:
        attempts = RETRIES if idempotent else 1
        refreshed = False
        for i in range(attempts):
            if authed:
                kw.setdefault("headers", {})["Authorization"] = f"Bearer {self._access_token()}"
            try:
                r = self._http.request(method, path, **kw)
            except httpx.HTTPError as exc:
                log.warning("paypal network error", extra={"fields": {"path": path, "error": type(exc).__name__}})
                if i + 1 < attempts:
                    time.sleep(self._backoff * 2**i)
                    continue
                raise _fail() from exc
            if r.status_code == 401 and authed and not refreshed:  # token revoked/expired early: refresh once
                refreshed = True
                self._access_token(force=True)
                return self._send(method, path, idempotent=idempotent, authed=authed, **kw)
            if r.status_code in RETRY_STATUSES and i + 1 < attempts:
                time.sleep(self._backoff * 2**i)
                continue
            return r
        return r

    @staticmethod
    def _ok(r: httpx.Response, what: str) -> dict:
        if r.status_code < 300:
            return r.json() if r.content else {}
        try:
            body = r.json()
        except ValueError:
            body = {}
        log.error("paypal error", extra={"fields": {
            "what": what, "status": r.status_code, "name": body.get("name"), "debug_id": body.get("debug_id"),
            "issues": [d.get("issue") for d in body.get("details", [])][:5]}})
        raise _fail()

    @staticmethod
    def _issues(r: httpx.Response) -> set[str]:
        try:
            return {d.get("issue") for d in r.json().get("details", [])}
        except ValueError:
            return set()

    # --- Orders v2 (donations) ---
    def create_order(self, amount_cents: int, request_id: str) -> str:
        r = self._send("POST", "/v2/checkout/orders", idempotent=True, headers={"PayPal-Request-Id": request_id},
                       json={"intent": "CAPTURE", "purchase_units": [{
                           "amount": {"currency_code": "USD", "value": cents_to_value(amount_cents)},
                           "description": "Donation to the Yamuna (RiverMind)"}]})
        return self._ok(r, "create_order")["id"]

    def capture_order(self, order_id: str, request_id: str) -> str:
        """Returns the capture id. Already captured -> the existing capture id (re-capture is safe)."""
        r = self._send("POST", f"/v2/checkout/orders/{order_id}/capture", idempotent=True,
                       headers={"PayPal-Request-Id": request_id, "Content-Type": "application/json"})
        if r.status_code == 422 and "ORDER_ALREADY_CAPTURED" in self._issues(r):
            r = self._send("GET", f"/v2/checkout/orders/{order_id}", idempotent=True)
        elif r.status_code == 422 and "ORDER_NOT_APPROVED" in self._issues(r):
            raise ApiError("INVALID_STATE", "The donor has not approved this payment in PayPal yet")
        elif r.status_code == 404:
            raise ApiError("NOT_FOUND", "PayPal does not know this order")
        body = self._ok(r, "capture_order")
        try:
            capture = body["purchase_units"][0]["payments"]["captures"][0]
        except (KeyError, IndexError) as exc:
            raise _fail() from exc
        if capture.get("status") != "COMPLETED":
            raise ApiError("INVALID_STATE", f"PayPal capture is {capture.get('status')}, not COMPLETED")
        return capture["id"]

    # --- Payouts ---
    def send_payout(self, sender_batch_id: str, amount_cents: int, receiver: str) -> dict:
        """A repeat with the same sender_batch_id never pays twice: PayPal answers 400 "already exists" with a link to
        the original batch (verified on sandbox), and we return that batch so crash recovery can carry on."""
        r = self._send("POST", "/v1/payments/payouts", idempotent=True, headers={"PayPal-Request-Id": sender_batch_id},
                       json={"sender_batch_header": {"sender_batch_id": sender_batch_id,
                                                     "email_subject": "RiverMind cleanup payment"},
                             "items": [{"recipient_type": "EMAIL", "receiver": receiver,
                                        "amount": {"value": cents_to_value(amount_cents), "currency": "USD"},
                                        "note": "Thank you for cleaning the river", "sender_item_id": sender_batch_id}]})
        if r.status_code == 400:
            existing = self._existing_batch(r)
            if existing:
                log.info("payout batch already exists; using it", extra={"fields": {"batch_id": existing}})
                return {"batch_id": existing, "item_id": None, "item_status": None}
        header = self._ok(r, "send_payout")["batch_header"]
        return {"batch_id": header["payout_batch_id"], "item_id": None, "item_status": None}

    @staticmethod
    def _existing_batch(r: httpx.Response) -> str | None:
        try:
            details = r.json().get("details") or []
        except ValueError:
            return None
        for d in details:
            if d.get("field") == "SENDER_BATCH_ID" and "already exists" in str(d.get("issue")):
                for link in d.get("link") or []:
                    if link.get("rel") == "self" and "/v1/payments/payouts/" in link.get("href", ""):
                        return link["href"].rstrip("/").rsplit("/", 1)[-1]
        return None

    def get_payout_batch(self, batch_id: str) -> dict:
        body = self._ok(self._send("GET", f"/v1/payments/payouts/{batch_id}", idempotent=True), "get_payout_batch")
        items = body.get("items") or [{}]
        return {"batch_id": batch_id, "item_id": items[0].get("payout_item_id"),
                "item_status": items[0].get("transaction_status")}

    # --- Webhooks ---
    def verify_webhook(self, headers: dict, raw_body: bytes) -> bool:
        h = {k.lower(): v for k, v in headers.items()}
        needed = ("paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig",
                  "paypal-transmission-time")
        if not self._webhook_id or not all(h.get(k) for k in needed):
            return False
        meta = {"auth_algo": h["paypal-auth-algo"], "cert_url": h["paypal-cert-url"],
                "transmission_id": h["paypal-transmission-id"], "transmission_sig": h["paypal-transmission-sig"],
                "transmission_time": h["paypal-transmission-time"], "webhook_id": self._webhook_id}
        # The event must be sent exactly as received; re-serialising it can break the signature.
        payload = json.dumps(meta)[:-1] + ', "webhook_event": ' + raw_body.decode() + "}"
        r = self._send("POST", "/v1/notifications/verify-webhook-signature", idempotent=True, content=payload,
                       headers={"Content-Type": "application/json"})
        try:
            return self._ok(r, "verify_webhook").get("verification_status") == "SUCCESS"
        except ApiError:
            return False

    # --- Invoices (F14): through the PayPal Agent Toolkit's invoice tools ---
    def send_invoice(self, amount_cents: int, sponsor_email: str, description: str) -> str:
        """create_invoice + send_invoice tools. The amount is already capped by the caller (MAX_INVOICE_CENTS)."""
        try:  # installed separately: pip install --no-deps -r backend/requirements-toolkit.txt
            from paypal_agent_toolkit.shared.api import PayPalAPI
            from paypal_agent_toolkit.shared.configuration import Context
        except ImportError as exc:
            log.error("paypal-agent-toolkit is not installed")
            raise _fail("Agent fundraising invoices are not available on this server") from exc

        api = PayPalAPI(client_id=self._id, secret=self._secret, context=Context(sandbox=True))
        text = description[:500]
        created = self._toolkit(api, "create_invoice", {
            "currency_code": "USD", "note": text,
            "primary_recipients": [{"billing_info": {"email_address": sponsor_email}}],
            "items": [{"name": "River cleanup sponsorship", "description": text, "quantity": "1",
                       "unit_amount": {"currency_code": "USD", "value": cents_to_value(amount_cents)}}],
        })
        invoice_id = created.get("id") or str(created.get("href", "")).rstrip("/").rsplit("/", 1)[-1]
        if not invoice_id:
            raise _fail()
        self._toolkit(api, "send_invoice", {"invoice_id": invoice_id, "send_to_recipient": True})
        return invoice_id

    @staticmethod
    def _toolkit(api, method: str, params: dict) -> dict:
        """The toolkit uses requests without timeouts, so we enforce our 15 s limit around it."""
        future = _toolkit_pool.submit(api.run, method, params)
        try:
            out = future.result(timeout=TIMEOUT_S)
            return json.loads(out) if out else {}
        except Exception as exc:
            log.error("paypal toolkit error", extra={"fields": {"method": method, "error": type(exc).__name__}})
            raise _fail() from exc


@lru_cache
def _real() -> PayPalClient:
    return PayPalClient(get_settings())


def get_paypal():
    return MockPayPal() if get_settings().PAYPAL_MODE == "mock" else _real()
