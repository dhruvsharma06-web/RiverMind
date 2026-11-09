"""PayPal sandbox spike (P3 S0.1). Proves OAuth, Orders v2 capture and Payouts reach a final state.

Run from backend/:  .venv/bin/python scripts/paypal_spike.py [--skip-order]
Needs PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_SANDBOX_RECEIVER in ../.env or the environment.
Never prints secrets or the access token.
"""
import argparse
import sys
import time
import uuid

import httpx
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE = "https://api-m.sandbox.paypal.com"


class SpikeEnv(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), env_ignore_empty=True, extra="ignore")
    PAYPAL_CLIENT_ID: str
    PAYPAL_CLIENT_SECRET: SecretStr
    PAYPAL_SANDBOX_RECEIVER: str


def check(resp: httpx.Response, step: str) -> dict:
    if resp.status_code >= 300:
        # PayPal error bodies hold no secrets; debug_id is what PayPal support asks for.
        print(f"FAIL {step}: HTTP {resp.status_code} {resp.text[:800]}")
        sys.exit(1)
    return resp.json()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-order", action="store_true", help="only test Payouts")
    args = ap.parse_args()
    env = SpikeEnv()

    with httpx.Client(base_url=BASE, timeout=15) as c:
        tok = check(c.post("/v1/oauth2/token", data={"grant_type": "client_credentials"},
                           auth=(env.PAYPAL_CLIENT_ID, env.PAYPAL_CLIENT_SECRET.get_secret_value())), "oauth")
        c.headers["Authorization"] = f"Bearer {tok['access_token']}"
        print(f"OK  oauth: token received, expires_in={tok['expires_in']}s")

        if not args.skip_order:
            order = check(c.post("/v2/checkout/orders", headers={"PayPal-Request-Id": str(uuid.uuid4())}, json={
                "intent": "CAPTURE",
                "purchase_units": [{"amount": {"currency_code": "USD", "value": "5.00"}}],
            }), "create order")
            approve = next(link["href"] for link in order["links"] if link["rel"] in ("approve", "payer-action"))
            print(f"OK  order {order['id']} status={order['status']}")
            input(f"\nOpen this link, pay with the sandbox PERSONAL account, then press Enter:\n{approve}\n")
            cap = check(c.post(f"/v2/checkout/orders/{order['id']}/capture",
                               headers={"PayPal-Request-Id": str(uuid.uuid4()), "Content-Type": "application/json"}),
                        "capture")
            print(f"OK  capture status={cap['status']}  (want COMPLETED)")

        # Unique per run so the spike can be re-run; the app itself uses rm-{payout_id}-a{attempt}.
        batch_id = f"rm-spike-{int(time.time())}"
        payout = check(c.post("/v1/payments/payouts", headers={"PayPal-Request-Id": batch_id}, json={
            "sender_batch_header": {"sender_batch_id": batch_id, "email_subject": "RiverMind test"},
            "items": [{"recipient_type": "EMAIL", "amount": {"value": "1.00", "currency": "USD"},
                       "receiver": env.PAYPAL_SANDBOX_RECEIVER, "sender_item_id": "spike-1"}],
        }), "create payout")
        pb_id = payout["batch_header"]["payout_batch_id"]
        print(f"OK  payout batch {pb_id} accepted ({payout['batch_header']['batch_status']}) — polling item status")

        status = None
        for _ in range(20):
            time.sleep(3)
            batch = check(c.get(f"/v1/payments/payouts/{pb_id}"), "get payout batch")
            status = batch["items"][0]["transaction_status"] if batch.get("items") else None
            print(f"    batch={batch['batch_header']['batch_status']} item={status}")
            if status in ("SUCCESS", "FAILED", "UNCLAIMED", "RETURNED", "BLOCKED", "DENIED"):
                break
        print(f"\n{'PASS' if status == 'SUCCESS' else 'FAIL'}: payout item final status = {status}")
        sys.exit(0 if status == "SUCCESS" else 1)


if __name__ == "__main__":
    main()
