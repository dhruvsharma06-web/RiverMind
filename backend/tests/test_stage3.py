"""S3: diary after PAID, webhooks drive payout/donation status (deduped, never backwards)."""
from app.models import DiaryEntry, LedgerEntry, Payout
from app.services import payouts
from sqlalchemy import func, select

from tests.conftest import ai_impl
from tests.test_endpoints import API, IK, claim, make_bounty, proof
from tests.test_paypal import FlakyPayPal


def diary_count(db):
    return db.scalar(select(func.count()).select_from(DiaryEntry))


def test_diary_written_after_paid(seeded, monkeypatch, db):
    before = diary_count(db)
    bid = make_bounty(seeded, amount=1500, monkeypatch=monkeypatch)
    assert proof(seeded, bid, claim(seeded, bid)).json()["bounty"]["status"] == "PAID"
    assert diary_count(db) == before + 1


def test_diary_with_unvalidated_numbers_is_not_stored(seeded, monkeypatch, db):
    orig = ai_impl().write_diary
    monkeypatch.setattr(ai_impl(), "write_diary",
                        lambda self, *a: orig(self, *a).model_copy(update={"numbers_validated": False}))
    before = diary_count(db)
    bid = make_bounty(seeded, amount=1500, monkeypatch=monkeypatch)
    proof(seeded, bid, claim(seeded, bid))
    assert diary_count(db) == before


def item_event(event_id, kind, payout):
    return {"id": event_id, "event_type": f"PAYMENT.PAYOUTS-ITEM.{kind}",
            "resource": {"payout_batch_id": payout.paypal_batch_id, "payout_item_id": "ITEM-9",
                         "transaction_status": kind, "payout_item": {"sender_item_id": payout.sender_batch_id}}}


def sent_payout(seeded, monkeypatch, db):
    """A payout PayPal accepted but still reports PENDING (stays SENT)."""
    fake = FlakyPayPal(pending_polls=99)
    monkeypatch.setattr(payouts, "get_paypal", lambda: fake)
    monkeypatch.setattr(payouts, "POLL_INTERVAL_S", 0)
    bid = make_bounty(seeded, amount=1500, monkeypatch=monkeypatch)
    proof(seeded, bid, claim(seeded, bid))
    p = db.scalar(select(Payout).where(Payout.bounty_id == bid))
    assert p.status == "SENT"
    return bid, p


def test_webhook_success_pays_once_and_never_goes_backwards(seeded, monkeypatch, db):
    bid, p = sent_payout(seeded, monkeypatch, db)
    ok = item_event("WH-A", "SUCCEEDED", p)
    assert seeded.post(f"{API}/webhooks/paypal", json=ok).json() == {"received": True}
    assert seeded.post(f"{API}/webhooks/paypal", json=ok).json() == {"received": True}  # duplicate: no-op
    db.refresh(p)
    assert p.status == "SUCCEEDED"
    assert seeded.get(f"{API}/bounties/{bid}").json()["status"] == "PAID"

    seeded.post(f"{API}/webhooks/paypal", json=item_event("WH-B", "RETURNED", p))  # late, contradictory
    db.refresh(p)
    assert p.status == "SUCCEEDED"
    assert db.scalar(select(func.count()).select_from(LedgerEntry).where(LedgerEntry.kind == "PAYOUT")) == 1


def test_webhook_failure_marks_payout_failed(seeded, monkeypatch, db):
    bid, p = sent_payout(seeded, monkeypatch, db)
    seeded.post(f"{API}/webhooks/paypal", json=item_event("WH-C", "UNCLAIMED", p))
    db.refresh(p)
    assert p.status == "FAILED" and seeded.get(f"{API}/bounties/{bid}").json()["status"] == "PAYOUT_FAILED"


def test_webhook_for_unknown_payout_is_ignored(seeded):
    ev = {"id": "WH-D", "event_type": "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
          "resource": {"payout_batch_id": "NOPE", "payout_item": {"sender_item_id": "rm-nope-a1"}}}
    assert seeded.post(f"{API}/webhooks/paypal", json=ev).json() == {"received": True}


def test_capture_webhook_records_donation_once(seeded, db):
    oid = seeded.post(f"{API}/donations/orders", json={"amount_cents": 700}, headers=IK()).json()["order_id"]
    ev = {"id": "WH-E", "event_type": "PAYMENT.CAPTURE.COMPLETED",
          "resource": {"id": "CAP-77", "status": "COMPLETED", "supplementary_data": {"related_ids": {"order_id": oid}}}}
    seeded.post(f"{API}/webhooks/paypal", json=ev)
    assert seeded.get(f"{API}/donations").json()["total_cents"] == 700
    # the browser's capture call arriving later returns the same donation and adds no second ledger entry
    assert seeded.post(f"{API}/donations/orders/{oid}/capture").json()["donation"]["amount_cents"] == 700
    assert db.scalar(select(func.count()).select_from(LedgerEntry).where(LedgerEntry.kind == "DONATION")) == 1
