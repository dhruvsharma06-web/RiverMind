"""PAYPAL_MODE=mock. Same methods as the real client (paypal_client.py). Payout items succeed at once and
any order id captures, as CONTRACT.md "Payout safety" says. Ids start with MOCK- so they are never mistaken for PayPal's."""
import uuid


def _id(prefix: str) -> str:
    return f"MOCK-{prefix}-{uuid.uuid4().hex[:12].upper()}"


class MockPayPal:
    mode = "mock"

    def create_order(self, amount_cents: int, request_id: str) -> str:
        return _id("ORDER")

    def capture_order(self, order_id: str, request_id: str) -> str:
        """Returns the capture id."""
        return _id("CAPTURE")

    def send_payout(self, sender_batch_id: str, amount_cents: int, receiver: str) -> dict:
        batch = _id("BATCH")
        return {"batch_id": batch, "item_id": f"{batch}-ITEM", "item_status": "SUCCESS"}

    def get_payout_batch(self, batch_id: str) -> dict:
        return {"batch_id": batch_id, "item_id": f"{batch_id}-ITEM", "item_status": "SUCCESS"}

    def verify_webhook(self, headers: dict, raw_body: bytes) -> bool:
        return True  # contract: verification is skipped only in mock mode

    def send_invoice(self, amount_cents: int, sponsor_email: str, description: str) -> str:
        return _id("INV")
