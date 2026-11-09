"""Pure service tests: state machine table, budget caps, verification policy."""
from datetime import UTC, datetime, timedelta

import pytest
from app.config import get_settings
from app.errors import ApiError
from app.services import bounty_fsm, budget, verify_policy

STATUSES = ["OPEN", "CLAIMED", "PROOF_SUBMITTED", "VERIFIED", "REJECTED", "PAYOUT_PENDING_APPROVAL", "PAID",
            "PAYOUT_FAILED"]
EVENTS = sorted({e for _, e in bounty_fsm.TRANSITIONS})
ALLOWED = {
    ("OPEN", "claim"): "CLAIMED",
    ("CLAIMED", "proof"): "PROOF_SUBMITTED",
    ("PROOF_SUBMITTED", "policy_pass"): "VERIFIED",
    ("PROOF_SUBMITTED", "policy_fail"): "REJECTED",
    ("VERIFIED", "needs_approval"): "PAYOUT_PENDING_APPROVAL",
    ("VERIFIED", "paid"): "PAID",
    ("PAYOUT_PENDING_APPROVAL", "paid"): "PAID",
    ("VERIFIED", "payout_failed"): "PAYOUT_FAILED",
    ("PAYOUT_PENDING_APPROVAL", "payout_failed"): "PAYOUT_FAILED",
    ("PAYOUT_PENDING_APPROVAL", "veto"): "REJECTED",
    ("PAYOUT_FAILED", "retry"): "VERIFIED",
}


@pytest.mark.parametrize("status", STATUSES)
@pytest.mark.parametrize("event", EVENTS)
def test_fsm_table(status, event):
    assert bounty_fsm.next_status(status, event) == ALLOWED.get((status, event))


def test_terminal_states_have_no_exit():
    assert all(bounty_fsm.next_status(s, e) is None for s in ("REJECTED", "PAID") for e in EVENTS)


# --- budget ---
S = get_settings()  # MIN 500, MAX 5000, DAILY_CAP 20000


@pytest.mark.parametrize("proposed, expected", [(100, 500), (500, 500), (1500, 1500), (5000, 5000), (99999, 5000)])
def test_budget_clamps(proposed, expected):
    assert budget.validate(proposed, settings=S, available=10**6, spent_today_cents=0) == expected


def test_budget_over_available():
    with pytest.raises(ApiError) as e:
        budget.validate(1500, settings=S, available=1499, spent_today_cents=0)
    assert e.value.code == "BUDGET_EXCEEDED"


def test_budget_clamped_amount_checked_against_available():
    with pytest.raises(ApiError):  # 100 is clamped up to 500, which is more than 400 available
        budget.validate(100, settings=S, available=400, spent_today_cents=0)


def test_budget_daily_cap_edge():
    assert budget.validate(1000, settings=S, available=10**6, spent_today_cents=19000) == 1000
    with pytest.raises(ApiError) as e:
        budget.validate(1001, settings=S, available=10**6, spent_today_cents=19000)
    assert e.value.code == "BUDGET_EXCEEDED"


def test_treasury_math():
    t = budget.Treasury(seed=50000, donated=2500, reserved=1500, paid=1500)
    assert t.available == 49500


# --- verification policy ---
T0 = datetime(2026, 11, 10, 8, 0, tzinfo=UTC)
AI_OK = {
    "scene_match": {"passed": True, "inliers": 61}, "count_drop": {"passed": True, "before_count": 14, "after_count": 2},
    "llm": {"passed": True, "vote": 0.9, "notes": ""}, "manipulation": {"flagged": False},
}
GEO_OK = {"passed": True, "distance_m": 10.0, "source": "browser"}
DUP_OK = {"passed": True, "nearest_hamming": 20}


def test_geo_limit_is_radius_plus_150():
    lat0, lon0 = 28.5440, 77.3070
    one_m_lat = 1 / 111_195
    assert verify_policy.geo_check(lat0, lon0, 150, lat0 + 299 * one_m_lat, lon0)["passed"]
    assert not verify_policy.geo_check(lat0, lon0, 150, lat0 + 301 * one_m_lat, lon0)["passed"]


@pytest.mark.parametrize("before, after, ok", [
    (T0 + timedelta(minutes=1), T0 + timedelta(minutes=30), True),
    (T0 + timedelta(minutes=30), T0 + timedelta(minutes=1), False),   # after before before
    (T0 - timedelta(minutes=1), T0 + timedelta(minutes=30), False),   # before the claim
    (T0 + timedelta(minutes=1), T0 + timedelta(days=3), True),  # no upper time limit
])
def test_time_window(before, after, ok):
    assert verify_policy.time_check(before, after, T0)["passed"] is ok


def test_duplicate_rules():
    a, b = "ffffffffffffffff", "fffffffffffffff0"  # Hamming 4
    assert verify_policy.duplicate_check(a, b, [])["passed"]
    assert not verify_policy.duplicate_check(a, "fffffffffffffffc", [])["passed"]  # Hamming 2 < 3
    far = "0000000000000000"
    assert verify_policy.duplicate_check(a, b, [far])["passed"]
    res = verify_policy.duplicate_check(a, b, ["fffffffffffff000"])  # 12 from a but 8 from b... both >= 6
    assert res["passed"]
    res = verify_policy.duplicate_check(a, b, ["ffffffffffffff00"])  # 8 from a, 4 from b -> reused
    assert not res["passed"] and res["nearest_hamming"] == 4


def test_decide_all_pass_and_score():
    passed, score, checks, reasons, rejection = verify_policy.decide(AI_OK, GEO_OK, {"passed": True}, DUP_OK)
    assert passed and rejection is None and reasons == ["All checks passed"]
    assert score == round((0.9 + 1.0 + (1 - 2 / 14)) / 3, 2)
    assert checks["sensor"] == {"passed": None, "turbidity_delta": None}


@pytest.mark.parametrize("override, label", [
    ({"geo": {**GEO_OK, "passed": False}}, "photos taken too far from the bounty"),
    ({"time": {"passed": False}}, "photos were not taken after the claim, before photo first"),
    ({"duplicate": {"passed": False, "nearest_hamming": 0}}, "duplicate photo"),
    ({"ai": {**AI_OK, "manipulation": {"flagged": True}}}, "photo looks edited or is a photo of a screen"),
    ({"ai": {**AI_OK, "llm": {"passed": False, "vote": 0.2, "notes": ""}}}, "AI reviewer was not convinced"),
])
def test_decide_any_failure_rejects(override, label):
    args = {"ai": AI_OK, "geo": GEO_OK, "time": {"passed": True}, "duplicate": DUP_OK, **override}
    passed, _, _, reasons, rejection = verify_policy.decide(**args)
    assert not passed and rejection == label and label in reasons


def test_duplicate_is_reported_first():
    ai = {**AI_OK, "count_drop": {"passed": False, "before_count": 9, "after_count": 9}}
    *_, rejection = verify_policy.decide(ai, GEO_OK, {"passed": True}, {"passed": False, "nearest_hamming": 0})
    assert rejection == "duplicate photo"


def test_score_never_negative():
    ai = {**AI_OK, "count_drop": {"passed": False, "before_count": 1, "after_count": 20},
          "llm": {"passed": False, "vote": 0.0, "notes": ""}, "scene_match": {"passed": False, "inliers": 0}}
    assert verify_policy.decide(ai, GEO_OK, {"passed": True}, DUP_OK)[1] == 0.0
