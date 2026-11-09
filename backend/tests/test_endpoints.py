"""Every contract endpoint: happy path, invalid input, auth, dependency failure, and the money journeys."""
import io
import uuid
from datetime import timedelta

import pytest
from app.adapters import ai_standin
from app.adapters.paypal_mock import MockPayPal
from app.config import get_settings
from app.models import Bounty, LedgerEntry, Payout, WebhookEvent, utcnow
from PIL import Image
from sqlalchemy import func, select

from tests.conftest import COUNCIL, DEVICE, jpeg

API = "/api/v1"
SPOT = (28.5440, 77.3070)  # Kalindi Kunj: > 2 km from every seed point
IK = lambda: {"Idempotency-Key": str(uuid.uuid4())}


def err(r, status, code):
    assert r.status_code == status, r.text
    body = r.json()
    assert set(body) == {"error"} and body["error"]["code"] == code
    return body["error"]


def upload_waste(c, lat=SPOT[0], lon=SPOT[1], seed=1, source="upload"):
    data = {"source": source} | ({"lat": lat, "lon": lon} if lat is not None else {})
    return c.post(f"{API}/media/analyze", files={"file": ("w.jpg", jpeg(seed), "image/jpeg")}, data=data)


def make_bounty(c, amount=1500, lat=SPOT[0], seed=1, monkeypatch=None):
    """Upload a waste image -> WASTE event -> bounty of `amount` (agent proposal patched)."""
    orig = ai_standin.StandInMockAI.propose_bounty

    def propose(self, event, budget):
        return orig(self, event, budget).model_copy(update={"amount_cents": amount})

    monkeypatch.setattr(ai_standin.StandInMockAI, "propose_bounty", propose)
    r = upload_waste(c, lat=lat, seed=seed)
    assert r.status_code == 200, r.text
    assert r.json()["bounty_id"], r.json()
    return r.json()["bounty_id"]


def claim(c, bounty_id, email="asha-personal@example.com"):
    r = c.post(f"{API}/bounties/{bounty_id}/claim", json={"worker_name": "Asha", "paypal_email": email})
    assert r.status_code == 200, r.text
    return r.json()["claim_token"]


def proof(c, bounty_id, token, before=101, after=202, lat=SPOT[0], lon=SPOT[1], before_img=None):
    now = utcnow()
    return c.post(
        f"{API}/bounties/{bounty_id}/proof", headers={"X-Claim-Token": token} if token else {},
        files={"before": ("b.jpg", before_img or jpeg(before), "image/jpeg"),
               "after": ("a.jpg", jpeg(after), "image/jpeg")},
        data={"lat": lat, "lon": lon, "before_captured_at": (now + timedelta(seconds=1)).isoformat(),
              "after_captured_at": (now + timedelta(seconds=2)).isoformat()},
    )


# --- 1 health / 22 reset / 19 diary ---
def test_reset_needs_council(client):
    err(client.post(f"{API}/demo/reset"), 401, "UNAUTHORIZED")
    err(client.post(f"{API}/demo/reset", headers={"Authorization": "Bearer wrong"}), 401, "UNAUTHORIZED")


def test_diary(client):
    err(client.get(f"{API}/diary/latest"), 404, "NOT_FOUND")
    client.post(f"{API}/demo/reset", headers=COUNCIL)
    d = client.get(f"{API}/diary/latest").json()
    assert d["model_version"] == "seed" and d["mood"] == "hopeful"


# --- 2-3 readings ---
def reading(seq, ntu=38.0, **kw):
    return {"device_id": "yamuna-okhla-01", "seq": seq, "ts": "2026-11-10T07:30:00Z", "lat": 28.5355,
            "lon": 77.31, "turbidity_ntu": ntu, "ph": 7.4, "tds_ppm": 612.0, "temp_c": 24.1, "simulated": True} | kw


def test_readings_auth(seeded):
    err(seeded.post(f"{API}/readings", json=reading(1)), 401, "UNAUTHORIZED")
    err(seeded.post(f"{API}/readings", json=reading(1), headers={"X-Device-Token": "nope"}), 401, "UNAUTHORIZED")
    err(seeded.post(f"{API}/readings", json=reading(1, device_id="other"), headers=DEVICE), 401, "UNAUTHORIZED")


@pytest.mark.parametrize("bad", [{"ph": 15}, {"seq": -1}, {"surprise": 1}, {"ts": "yesterday"}])
def test_readings_validation(seeded, bad):
    e = err(seeded.post(f"{API}/readings", json=reading(1) | bad, headers=DEVICE), 422, "VALIDATION_ERROR")
    assert e["details"]["fields"]


def test_readings_duplicate_and_spike_opens_event_and_bounty(seeded):
    for seq in range(1, 5):
        r = seeded.post(f"{API}/readings", json=reading(seq), headers=DEVICE).json()
        assert r["duplicate"] is False and r["event_id"] is None
    dup = seeded.post(f"{API}/readings", json=reading(4, ntu=999), headers=DEVICE).json()
    assert dup["duplicate"] is True
    spike = seeded.post(f"{API}/readings", json=reading(5, ntu=96.0), headers=DEVICE).json()
    assert spike["event_id"] and spike["bounty_id"]

    items = seeded.get(f"{API}/readings").json()["items"]
    assert [i["seq"] for i in items] == [5, 4, 3, 2, 1] and items[1]["turbidity_ntu"] == 38.0  # dup wrote nothing
    ev = seeded.get(f"{API}/events?type=SENSOR_ANOMALY").json()["items"][0]
    assert ev["id"] == spike["event_id"] and ev["severity"] == 3 and ev["summary"].startswith("Simulated reading")
    assert ev["bounty_id"] == spike["bounty_id"]


def test_reading_still_stored_when_ai_down(seeded, monkeypatch):
    def boom(*a):
        raise ai_standin.AIUnavailable()

    monkeypatch.setattr(ai_standin.StandInMockAI, "detect_sensor_anomaly", boom)
    r = seeded.post(f"{API}/readings", json=reading(1), headers=DEVICE)
    assert r.status_code == 200 and r.json()["event_id"] is None


# --- 4-6 media + events ---
def test_media_waste_creates_event_and_bounty_once(seeded):
    r = upload_waste(seeded).json()
    assert r["analysis"]["waste_score"] >= 0.5 and r["event_id"] and r["bounty_id"]
    r2 = upload_waste(seeded, lat=SPOT[0] + 0.001, seed=2).json()  # ~110 m away, same 6 h window
    assert r2["event_id"] and r2["bounty_id"] is None
    b = seeded.get(f"{API}/bounties/{r['bounty_id']}").json()
    assert b["expires_at"] is None  # bounties never expire
    assert b["status"] == "OPEN" and get_settings().MIN_BOUNTY_CENTS <= b["amount_cents"] <= get_settings().MAX_BOUNTY_CENTS


def test_media_clean_image_opens_nothing(seeded, monkeypatch):
    orig = ai_standin.StandInMockAI.analyze_media
    monkeypatch.setattr(ai_standin.StandInMockAI, "analyze_media",
                        lambda self, *a: orig(self, *a).model_copy(update={"waste_score": 0.12, "waste_detected": False}))
    r = upload_waste(seeded).json()
    assert r["event_id"] is None and r["bounty_id"] is None


def test_media_validation(seeded):
    err(upload_waste(seeded, lat=None, source="camera"), 422, "VALIDATION_ERROR")
    r = seeded.post(f"{API}/media/analyze", files={"file": ("x.jpg", b"not an image", "image/jpeg")})
    err(r, 422, "VALIDATION_ERROR")
    gif = io.BytesIO()
    Image.new("RGB", (8, 8)).save(gif, format="GIF")
    err(seeded.post(f"{API}/media/analyze", files={"file": ("x.jpg", gif.getvalue(), "image/jpeg")}),
        422, "VALIDATION_ERROR")
    big = b"\xff" * (8 * 1024 * 1024 + 1)
    err(seeded.post(f"{API}/media/analyze", files={"file": ("x.jpg", big, "image/jpeg")}), 413, "PAYLOAD_TOO_LARGE")


def test_media_ai_down_is_503(seeded, monkeypatch):
    def boom(*a):
        raise ai_standin.AIUnavailable()

    monkeypatch.setattr(ai_standin.StandInMockAI, "analyze_media", boom)
    err(upload_waste(seeded), 503, "AI_UNAVAILABLE")


def test_get_media_strips_exif(seeded):
    img = Image.new("RGB", (32, 32), "blue")
    exif = Image.Exif()
    exif[0x010F] = "SecretCam"  # Make
    raw = io.BytesIO()
    img.save(raw, format="JPEG", exif=exif.tobytes())
    media_id = seeded.post(f"{API}/media/analyze", files={"file": ("e.jpg", raw.getvalue(), "image/jpeg")}).json()["media_id"]
    r = seeded.get(f"{API}/media/{media_id}")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert b"SecretCam" not in r.content and not Image.open(io.BytesIO(r.content)).getexif()
    err(seeded.get(f"{API}/media/{uuid.uuid4()}"), 404, "NOT_FOUND")


def test_events_list_and_filter(seeded):
    items = seeded.get(f"{API}/events").json()["items"]
    assert {e["type"] for e in items} == {"WASTE", "SENSOR_ANOMALY"}
    assert len(seeded.get(f"{API}/events?type=WASTE&limit=1").json()["items"]) == 1
    err(seeded.get(f"{API}/events?type=FIRE"), 422, "VALIDATION_ERROR")
    err(seeded.get(f"{API}/events?limit=0"), 422, "VALIDATION_ERROR")


# --- 7-10 bounties, claim, proof ---
def test_bounty_list_get(seeded):
    items = seeded.get(f"{API}/bounties?status=OPEN").json()["items"]
    assert len(items) == 1
    assert seeded.get(f"{API}/bounties/{items[0]['id']}").json() == items[0]
    assert seeded.get(f"{API}/bounties?status=PAID").json() == {"items": []}
    err(seeded.get(f"{API}/bounties/{uuid.uuid4()}"), 404, "NOT_FOUND")
    err(seeded.get(f"{API}/bounties?status=WHATEVER"), 422, "VALIDATION_ERROR")


def test_claim_rules(seeded, db):
    bid = seeded.get(f"{API}/bounties").json()["items"][0]["id"]
    err(seeded.post(f"{API}/bounties/{bid}/claim", json={"worker_name": "A", "paypal_email": "no-at-sign"}),
        422, "VALIDATION_ERROR")
    err(seeded.post(f"{API}/bounties/{uuid.uuid4()}/claim", json={"worker_name": "A", "paypal_email": "a@b.co"}),
        404, "NOT_FOUND")
    token = claim(seeded, bid)
    assert token.startswith("ct_")
    b = seeded.get(f"{API}/bounties/{bid}").json()
    assert b["status"] == "CLAIMED" and b["worker_name"] == "Asha" and "asha" not in str(b).replace("Asha", "")
    err(seeded.post(f"{API}/bounties/{bid}/claim", json={"worker_name": "B", "paypal_email": "b@b.co"}),
        409, "INVALID_STATE")

    # claims never lapse: a day-old claim is still held by the same worker
    row = db.get(Bounty, bid)
    row.claimed_at = utcnow() - timedelta(days=1)
    db.commit()
    b = seeded.get(f"{API}/bounties/{bid}").json()
    assert b["status"] == "CLAIMED" and b["worker_name"] == "Asha"


def test_proof_auth(seeded, monkeypatch):
    b1 = make_bounty(seeded, monkeypatch=monkeypatch)
    b2 = make_bounty(seeded, lat=SPOT[0] + 0.02, seed=3, monkeypatch=monkeypatch)
    t1, t2 = claim(seeded, b1), claim(seeded, b2)
    err(proof(seeded, b1, None), 401, "UNAUTHORIZED")
    err(proof(seeded, b1, t2), 401, "UNAUTHORIZED")  # a token only works for its own bounty
    assert proof(seeded, b1, t1).status_code == 200
    err(proof(seeded, b1, t1), 409, "INVALID_STATE")  # already decided


def test_proof_ai_down_keeps_claim(seeded, monkeypatch):
    bid = make_bounty(seeded, monkeypatch=monkeypatch)
    token = claim(seeded, bid)

    def boom(*a):
        raise ai_standin.AIUnavailable()

    monkeypatch.setattr(ai_standin.StandInMockAI, "verify_cleanup", boom)
    err(proof(seeded, bid, token), 503, "AI_UNAVAILABLE")
    assert seeded.get(f"{API}/bounties/{bid}").json()["status"] == "CLAIMED"


def test_proof_far_away_rejected_and_reserve_released(seeded, monkeypatch, db):
    bid = make_bounty(seeded, monkeypatch=monkeypatch)
    r = proof(seeded, bid, claim(seeded, bid), lat=SPOT[0] + 0.01).json()  # ~1.1 km off
    assert r["bounty"]["status"] == "REJECTED" and not r["verification"]["checks"]["geo"]["passed"]
    assert db.scalar(select(LedgerEntry).where(LedgerEntry.kind == "RELEASE", LedgerEntry.ref_id == bid))


# --- the money journeys ---
def test_small_bounty_pays_at_once(seeded, monkeypatch, db):
    bid = make_bounty(seeded, amount=1500, monkeypatch=monkeypatch)
    r = proof(seeded, bid, claim(seeded, bid))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["verification"]["passed"] is True
    assert body["bounty"]["status"] == "PAID"
    p = body["bounty"]["payout"]
    assert p["status"] == "SUCCEEDED" and p["receiver_masked"] == "as***@example.com"
    assert p["paypal_batch_id"].startswith("MOCK-")
    row = db.scalar(select(Payout).where(Payout.bounty_id == bid))
    assert row.sender_batch_id == f"rm-{row.id}-a1"
    status = seeded.get(f"{API}/river/status").json()["treasury"]
    assert status["paid_cents"] == 1500


def test_big_bounty_waits_for_council_and_double_approve_pays_once(seeded, monkeypatch, db):
    sends = []
    orig = MockPayPal.send_payout
    monkeypatch.setattr(MockPayPal, "send_payout", lambda self, *a: sends.append(a) or orig(self, *a))
    bid = make_bounty(seeded, amount=2500, monkeypatch=monkeypatch)
    body = proof(seeded, bid, claim(seeded, bid)).json()
    assert body["bounty"]["status"] == "PAYOUT_PENDING_APPROVAL"
    pid = body["bounty"]["payout"]["id"]
    assert seeded.get(f"{API}/payouts").json()["totals"]["pending_cents"] == 2500

    err(seeded.post(f"{API}/payouts/{pid}/approve", json={}), 401, "UNAUTHORIZED")
    err(seeded.post(f"{API}/payouts/{pid}/approve", json={}, headers=COUNCIL), 422, "VALIDATION_ERROR")  # no IK
    key = IK()
    first = seeded.post(f"{API}/payouts/{pid}/approve", json={"note": "ok"}, headers=COUNCIL | key)
    again = seeded.post(f"{API}/payouts/{pid}/approve", json={"note": "ok"}, headers=COUNCIL | key)
    assert first.status_code == again.status_code == 200 and first.json() == again.json()
    assert first.json()["payout"]["status"] == "SUCCEEDED"
    err(seeded.post(f"{API}/payouts/{pid}/approve", json={"note": "ok"}, headers=COUNCIL | IK()), 409, "INVALID_STATE")
    err(seeded.post(f"{API}/payouts/{pid}/approve", json={"note": "changed"}, headers=COUNCIL | key),
        409, "IDEMPOTENCY_CONFLICT")

    assert len(sends) == 1
    assert db.scalar(select(func.count()).select_from(LedgerEntry).where(LedgerEntry.kind == "PAYOUT")) == 1
    assert seeded.get(f"{API}/bounties/{bid}").json()["status"] == "PAID"
    totals = seeded.get(f"{API}/payouts").json()["totals"]
    assert totals == {"paid_cents": 2500, "pending_cents": 0}


def test_veto(seeded, monkeypatch):
    bid = make_bounty(seeded, amount=2500, monkeypatch=monkeypatch)
    pid = proof(seeded, bid, claim(seeded, bid)).json()["bounty"]["payout"]["id"]
    err(seeded.post(f"{API}/payouts/{pid}/veto", json={"reason": "x"}), 401, "UNAUTHORIZED")
    err(seeded.post(f"{API}/payouts/{pid}/veto", json={}, headers=COUNCIL), 422, "VALIDATION_ERROR")
    r = seeded.post(f"{API}/payouts/{pid}/veto", json={"reason": "photos look staged"}, headers=COUNCIL).json()
    assert r["payout"]["status"] == "VETOED"
    assert r["bounty"]["status"] == "REJECTED" and r["bounty"]["rejection_reason"] == "COUNCIL_VETO"
    err(seeded.post(f"{API}/payouts/{pid}/veto", json={"reason": "again"}, headers=COUNCIL), 409, "INVALID_STATE")
    err(seeded.post(f"{API}/payouts/{uuid.uuid4()}/veto", json={"reason": "x"}, headers=COUNCIL), 404, "NOT_FOUND")


def test_failed_payout_then_retry(seeded, monkeypatch, db):
    orig = MockPayPal.send_payout
    monkeypatch.setattr(MockPayPal, "send_payout", lambda self, *a: orig(self, *a) | {"item_status": "UNCLAIMED"})
    bid = make_bounty(seeded, amount=1500, monkeypatch=monkeypatch)
    body = proof(seeded, bid, claim(seeded, bid)).json()
    assert body["bounty"]["status"] == "PAYOUT_FAILED" and body["bounty"]["payout"]["status"] == "FAILED"
    pid = body["bounty"]["payout"]["id"]

    monkeypatch.setattr(MockPayPal, "send_payout", orig)
    err(seeded.post(f"{API}/payouts/{pid}/retry", headers=COUNCIL), 422, "VALIDATION_ERROR")  # no IK
    r = seeded.post(f"{API}/payouts/{pid}/retry", headers=COUNCIL | IK())
    assert r.status_code == 200 and r.json()["payout"]["status"] == "SUCCEEDED"
    row = db.get(Payout, pid)
    db.refresh(row)
    assert row.attempt == 2 and row.sender_batch_id == f"rm-{pid}-a2"
    assert seeded.get(f"{API}/bounties/{bid}").json()["status"] == "PAID"
    err(seeded.post(f"{API}/payouts/{pid}/retry", headers=COUNCIL | IK()), 409, "INVALID_STATE")


def test_reused_photo_rejected_as_duplicate(seeded, monkeypatch):
    b1 = make_bounty(seeded, amount=1500, monkeypatch=monkeypatch)
    assert proof(seeded, b1, claim(seeded, b1), before=101, after=202).json()["bounty"]["status"] == "PAID"
    b2 = make_bounty(seeded, amount=1500, lat=SPOT[0] + 0.02, seed=5, monkeypatch=monkeypatch)
    r = proof(seeded, b2, claim(seeded, b2), before=101, after=303, lat=SPOT[0] + 0.02).json()  # before reused
    assert r["bounty"]["status"] == "REJECTED" and r["bounty"]["rejection_reason"] == "duplicate photo"
    assert r["verification"]["checks"]["duplicate"] == {"passed": False, "nearest_hamming": 0}


def test_same_photo_twice_rejected(seeded, monkeypatch):
    bid = make_bounty(seeded, amount=1500, monkeypatch=monkeypatch)
    r = proof(seeded, bid, claim(seeded, bid), before=7, after=7).json()
    assert r["bounty"]["status"] == "REJECTED" and r["bounty"]["rejection_reason"] == "duplicate photo"


def test_budget_exhausted_means_no_bounty(seeded, db):
    db.add(LedgerEntry(kind="RESERVE", ref_type="test", ref_id="drain", amount_cents=48_900))  # leaves 100 available
    db.commit()
    r = upload_waste(seeded).json()
    assert r["event_id"] and r["bounty_id"] is None


# --- 15-17 donations ---
def test_donation_flow(seeded):
    err(seeded.post(f"{API}/donations/orders", json={"amount_cents": 500}), 422, "VALIDATION_ERROR")  # no IK
    err(seeded.post(f"{API}/donations/orders", json={"amount_cents": 99}, headers=IK()), 422, "VALIDATION_ERROR")
    err(seeded.post(f"{API}/donations/orders", json={"amount_cents": 500, "x": 1}, headers=IK()), 422,
        "VALIDATION_ERROR")
    key = IK()
    order = seeded.post(f"{API}/donations/orders", json={"amount_cents": 500, "donor_name": "Meera"}, headers=key)
    assert seeded.post(f"{API}/donations/orders", json={"amount_cents": 500, "donor_name": "Meera"},
                       headers=key).json() == order.json()
    oid = order.json()["order_id"]
    assert seeded.get(f"{API}/donations").json() == {"items": [], "total_cents": 0}  # not captured yet

    cap = seeded.post(f"{API}/donations/orders/{oid}/capture")
    assert cap.status_code == 200 and cap.json()["donation"]["status"] == "CAPTURED"
    assert seeded.post(f"{API}/donations/orders/{oid}/capture").json() == cap.json()
    err(seeded.post(f"{API}/donations/orders/NOPE/capture"), 404, "NOT_FOUND")

    listed = seeded.get(f"{API}/donations").json()
    assert listed["total_cents"] == 500 and listed["items"][0]["donor_name"] == "Meera"
    t = seeded.get(f"{API}/river/status").json()["treasury"]
    seed, reserved = get_settings().SEED_TREASURY_CENTS, t["reserved_cents"]
    assert t["donated_cents"] == 500 and t["available_cents"] == seed + 500 - reserved


# --- 18 status ---
def test_river_status(seeded):
    s = seeded.get(f"{API}/river/status").json()
    assert s["river"] == "Yamuna" and 0 <= s["health_score"] <= 100
    assert s["open_bounties"] == 1 and s["events_24h"] == 2 and s["latest_reading"] is None
    assert s["treasury"]["reserved_cents"] == seeded.get(f"{API}/bounties").json()["items"][0]["amount_cents"]


# --- 20 webhooks ---
def test_webhook_dedupe(seeded, db):
    ev = {"id": "WH-1", "event_type": "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", "resource": {}}
    assert seeded.post(f"{API}/webhooks/paypal", json=ev).json() == {"received": True}
    assert seeded.post(f"{API}/webhooks/paypal", json=ev).json() == {"received": True}
    assert db.scalar(select(func.count()).select_from(WebhookEvent)) == 1
    assert seeded.post(f"{API}/webhooks/paypal", json={"no": "id"}).status_code == 400


def test_webhook_refused_when_not_verifiable(seeded, monkeypatch):
    monkeypatch.setattr(MockPayPal, "verify_webhook", lambda self, h, b: False)
    assert seeded.post(f"{API}/webhooks/paypal", json={"id": "WH-2"}).status_code == 400


# --- 21 fundraise ---
def test_fundraise(seeded, monkeypatch):
    body = {"sponsor_email": "csr-sponsor@example.com"}
    err(seeded.post(f"{API}/agent/fundraise", json=body), 401, "UNAUTHORIZED")
    err(seeded.post(f"{API}/agent/fundraise", json={"sponsor_email": "bad"}, headers=COUNCIL), 422, "VALIDATION_ERROR")
    r = seeded.post(f"{API}/agent/fundraise", json=body, headers=COUNCIL).json()
    assert r["status"] == "SENT" and r["invoice_id"].startswith("MOCK-")
    monkeypatch.setattr(get_settings(), "MAX_INVOICE_CENTS", 2500)
    assert seeded.post(f"{API}/agent/fundraise", json=body, headers=COUNCIL).json()["amount_cents"] == 2500
