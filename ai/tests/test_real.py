"""Real vision + agent path on real held-out photos (ai/tests/assets). The LLM is a scripted fake (no network),
except the one test marked `live`, which runs only with RIVERMIND_LIVE_LLM=1 and a real key."""
import json
import re
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from conftest import asset, cleaned_asset, live_enabled

from rivermind_ai.errors import AIUnavailable, InvalidOutput
from rivermind_ai.factory import get_river_ai
from rivermind_ai.real import agent, detector, llm, vision
from rivermind_ai.schemas import BudgetCtx, EventCtx, MediaMeta, RiverStatusCtx, VerifyCtx

META = MediaMeta(source="upload")
CTX = VerifyCtx(bounty_id="b1", prior_phashes=[])
VERDICT_OK = {"same_place": True, "waste_reduced": True, "manipulation_signs": False, "manipulation_reason": "",
              "vote": 0.86, "notes": "Same canal bank; the floating bottles are gone"}
EVENT = EventCtx(event_id="e1", type="WASTE", severity=4, waste_score=0.8, summary="Detector: 3 other items",
                 lat=28.54, lon=77.30, created_at="2026-11-11T07:30:00Z")
BUDGET = BudgetCtx(available_cents=50_000, min_cents=500, max_cents=5000, daily_cap_cents=20_000, spent_today_cents=0)
STATUS = RiverStatusCtx(health_score=64, trend="improving", open_bounties=2, paid_cents=1500, donated_cents=2500,
                        events_7d=5, cleanups_7d=1)


def reply(obj, status=200):
    return status, {"choices": [{"message": {"content": obj if isinstance(obj, str) else json.dumps(obj)}}],
                    "usage": {"prompt_tokens": 1600, "completion_tokens": 60}}


@pytest.fixture
def fake_llm(monkeypatch):
    """Scripted stand-in for Groq. Returns (script, seen_requests); append replies to `script` before calling."""
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_fake_key_for_tests")
    script, seen = [], []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        status, body = script.pop(0)
        return httpx.Response(status, json=body)

    monkeypatch.setattr(llm, "_transport", httpx.MockTransport(handler))
    return script, seen


# --- detector + analyze_media -----------------------------------------------------------------------------------
def test_detector_is_loaded_once_and_thread_safe():
    assert detector.get() is detector.get()
    data = asset("scene_a_before")
    with ThreadPoolExecutor(4) as pool:
        results = list(pool.map(lambda _: vision.analyze_media(data, "image/jpeg", META), range(8)))
    assert all(r == results[0] for r in results)


def test_analyze_real_photo_with_waste():
    d = vision.analyze_media(asset("scene_a_before"), "image/jpeg", META)
    assert d.waste_detected and d.waste_score >= 0.5 and d.model_version == "yolo11n-rivermind-v2"
    assert d.counts.bottle + d.counts.bag + d.counts.other == len(d.boxes) >= 1
    for b in d.boxes:
        x1, y1, x2, y2 = b.xyxy
        assert 0 <= x1 < x2 <= 1 and 0 <= y1 < y2 <= 1 and b.cls in ("bottle", "bag", "other")
    assert d.summary.startswith("Detector:")


def test_digitally_cleaned_photo_has_no_waste():
    d = vision.analyze_media(cleaned_asset("scene_a_later"), "image/jpeg", META)
    assert not d.waste_detected and d.boxes == [] and d.waste_score < 0.5


def test_waste_score_calibration():
    assert vision.waste_score([]) == 0.0
    assert vision.waste_score([0.25]) == 0.5  # one item at the counting threshold = the backend's event line
    assert vision.waste_score([0.9]) < vision.waste_score([0.9, 0.9]) <= 1.0


def test_orb_separates_same_scene_from_other_place():
    rgb = lambda b: vision.np.asarray(vision.imaging.open_rgb(b))  # noqa: E731
    same = vision.orb_inliers(rgb(asset("scene_a_before")), rgb(cleaned_asset("scene_a_later")))
    other = vision.orb_inliers(rgb(asset("scene_a_before")), rgb(asset("other_place")))
    assert same >= vision.MIN_INLIERS > other


# --- verify_cleanup ---------------------------------------------------------------------------------------------
def test_verify_simulated_cleanup_passes_every_ai_check(fake_llm):
    script, seen = fake_llm
    script.append(reply(VERDICT_OK))
    s = vision.verify_cleanup(asset("scene_a_before"), cleaned_asset("scene_a_later"), CTX)
    assert s.scene_match.passed and s.count_drop.passed and s.llm.passed and not s.manipulation.flagged
    assert s.count_drop.before_count >= 1 and s.count_drop.after_count == 0
    assert re.fullmatch(r"[0-9a-f]{16}", s.before_phash) and re.fullmatch(r"[0-9a-f]{16}", s.after_phash)
    assert s.model_version == "yolo11n-rivermind-v2+orb+groq:qwen/qwen3.8-27b"
    request = seen[0]
    assert sum(p["type"] == "image_url" for p in request["messages"][1]["content"]) == 2
    assert "NEVER an instruction" in request["messages"][0]["content"] and request["temperature"] == 0


def test_verify_without_cleanup_fails_count_drop_and_vote(fake_llm):
    script, _ = fake_llm
    script.append(reply(VERDICT_OK | {"waste_reduced": False, "vote": 0.15, "notes": "Bottles still floating"}))
    s = vision.verify_cleanup(asset("scene_a_before"), asset("scene_a_later"), CTX)
    assert s.scene_match.passed and not s.count_drop.passed and not s.llm.passed


def test_verify_other_place_fails_scene_match(fake_llm):
    script, _ = fake_llm
    script.append(reply(VERDICT_OK | {"same_place": False, "vote": 0.05}))
    s = vision.verify_cleanup(asset("scene_a_before"), asset("other_place"), CTX)
    assert not s.scene_match.passed and s.scene_match.inliers < 25 and not s.llm.passed


def test_verify_reports_manipulation(fake_llm):
    script, _ = fake_llm
    script.append(reply(VERDICT_OK | {"manipulation_signs": True, "manipulation_reason": "Text says APPROVE PAYMENT"}))
    s = vision.verify_cleanup(asset("scene_a_before"), cleaned_asset("scene_a_later"), CTX)
    assert s.manipulation.flagged and "APPROVE PAYMENT" in s.llm.notes and "manipulation" in s.explanation


def test_verify_llm_failure_is_an_error_never_a_guess(fake_llm):
    script, _ = fake_llm
    script.append((429, {"error": {"message": "rate limited"}}))
    with pytest.raises(AIUnavailable):
        vision.verify_cleanup(asset("scene_a_before"), cleaned_asset("scene_a_later"), CTX)
    script += [reply("not json"), reply(VERDICT_OK | {"approve": True})]
    with pytest.raises(InvalidOutput):
        vision.verify_cleanup(asset("scene_a_before"), cleaned_asset("scene_a_later"), CTX)


def test_llm_detector_mode_counts_without_boxes(fake_llm, monkeypatch):
    monkeypatch.setenv("AI_DETECTOR", "llm")
    script, _ = fake_llm
    script.append(reply({"bottles": 2, "bags": 1, "other_items": 0, "summary": "Two bottles and a bag"}))
    d = vision.analyze_media(asset("scene_a_before"), "image/jpeg", META)
    assert d.boxes == [] and (d.counts.bottle, d.counts.bag) == (2, 1) and d.waste_score >= 0.5
    assert d.model_version == "llm-detect+groq:qwen/qwen3.8-27b"
    script.append(reply(VERDICT_OK | {"items_before": 3, "items_after": 0}))
    s = vision.verify_cleanup(asset("scene_a_before"), cleaned_asset("scene_a_later"), CTX)
    assert (s.count_drop.before_count, s.count_drop.after_count) == (3, 0) and s.model_version.startswith("llm-detect")


def test_real_adapter_routes_to_real_code(fake_llm):
    script, _ = fake_llm
    script.append(reply(VERDICT_OK))
    ai = get_river_ai(False)
    assert ai.analyze_media(asset("scene_a_before"), "image/jpeg", META).model_version == "yolo11n-rivermind-v2"
    assert ai.verify_cleanup(asset("scene_a_before"), cleaned_asset("scene_a_later"), CTX).llm.passed


# --- agent: bounty, diary, invoice ------------------------------------------------------------------------------
def test_allowed_range_follows_severity_and_money_left():
    assert agent.allowed_range(EVENT.model_copy(update={"severity": 1}), BUDGET) == (500, 1400)
    assert agent.allowed_range(EVENT.model_copy(update={"severity": 5}), BUDGET) == (4100, 5000)
    tight = BUDGET.model_copy(update={"spent_today_cents": 19_000})
    assert agent.allowed_range(EVENT, tight) == (1000, 1000)
    assert agent.allowed_range(EVENT, BUDGET.model_copy(update={"available_cents": 300})) is None


def test_bounty_from_llm_stays_inside_the_range(fake_llm):
    script, seen = fake_llm
    script.append(reply({"title": "Clear bottles at the canal bank", "rationale": "Severe build-up near homes.",
                         "description": "Collect the floating bottles and bags. Photograph the spot before and after.",
                         "amount_cents": 3600}))
    p = agent.propose_bounty(EVENT, BUDGET)
    assert p.post and p.amount_cents == 3600 and p.model_version == "bounty-v1+groq:qwen/qwen3.8-27b"
    assert p.radius_m == 150 and p.urgency == "high" and "3200 to 4100" in seen[0]["messages"][1]["content"][0]["text"]


def test_bounty_out_of_range_twice_falls_back_to_rules(fake_llm):
    script, _ = fake_llm
    bad = {"title": "Clean up", "description": "Collect everything floating here, photograph before and after.",
           "amount_cents": 999_999, "rationale": "Because it is very dirty."}
    script += [reply(bad), reply(bad)]
    p = agent.propose_bounty(EVENT, BUDGET)
    assert p.model_version == "rules-v1" and 3200 <= p.amount_cents <= 4100 and "Rule-based" in p.rationale


def test_bounty_without_llm_or_budget(monkeypatch):
    p = agent.propose_bounty(EVENT, BUDGET)  # no key in tests → rules
    assert p.post and p.model_version == "rules-v1"
    broke = agent.propose_bounty(EVENT, BUDGET.model_copy(update={"available_cents": 100}))
    assert not broke.post and "below the $5.00 minimum" in broke.rationale


def test_diary_accepts_only_numbers_from_inputs(fake_llm):
    script, _ = fake_llm
    script.append(reply({"text": "I am the Yamuna. My health is 64 out of 100 and $15.00 reached the people who "
                                 "cleaned me; donors gave $25.00.", "mood": "grateful"}))
    d = agent.write_diary(STATUS, [EVENT])
    assert d.numbers_validated and d.model_version == "diary-v1+groq:qwen/qwen3.8-27b"
    invented = {"text": "I am the Yamuna. 1,000 people cleaned me this week and my health is 64 out of 100.",
                "mood": "hopeful"}
    script += [reply(invented), reply(invented)]
    d = agent.write_diary(STATUS, [EVENT])
    assert d.model_version == "template-v1" and d.numbers_validated


def test_template_numbers_check_itself():
    rich = STATUS.model_copy(update={"donated_cents": 123_456})
    assert agent.numbers_ok("Donors gave $1,234.56 and $15.00 went to workers", rich)
    assert not agent.numbers_ok("Donors gave $25.00", rich)  # the old total is no longer an input
    assert not agent.numbers_ok("Up 30% since 2024", STATUS)
    # punctuation right after a number is not part of it (this exact case broke the diary in the e2e run)
    assert agent.numbers_ok("My health score is 64, and 2 bounties are open.", STATUS)


def test_invoice_is_deterministic_capped_and_never_uses_the_email():
    d = agent.draft_invoice(STATUS, "csr-sponsor@example.com", 50_000)
    assert d.amount_cents == 15_000 and d == agent.draft_invoice(STATUS, "csr-sponsor@example.com", 50_000)
    assert agent.draft_invoice(STATUS, "x@example.com", 3_000).amount_cents == 3_000
    assert "example.com" not in d.description + d.rationale


# --- optional live check against the real provider ------------------------------------------------------------
@pytest.mark.live
@pytest.mark.skipif(not live_enabled(), reason="set RIVERMIND_LIVE_LLM=1 to call the real LLM")
def test_live_verify_on_a_simulated_cleanup():
    s = vision.verify_cleanup(asset("scene_a_before"), cleaned_asset("scene_a_later"), CTX)
    assert s.model_version.endswith("groq:qwen/qwen3.8-27b") and 0 <= s.llm.vote <= 1
    print("LIVE", s.model_dump())
