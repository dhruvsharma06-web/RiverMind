"""Real adapter (USE_MOCK_AI=false): ONNX detector, ORB verification, rule-based agent text. No network."""
import io
import pathlib

import numpy as np
import pytest
from conftest import jpeg
from PIL import Image

from rivermind_ai import schemas
from rivermind_ai.real import RealRiverAI, agent

pytest.importorskip("onnxruntime")
pytest.importorskip("cv2")

ASSETS = pathlib.Path(__file__).resolve().parents[2] / "frontend" / "tests" / "assets"
META = schemas.MediaMeta(source="upload")
STATUS = schemas.RiverStatusCtx(health_score=64, trend="improving", open_bounties=2, paid_cents=1500,
                                donated_cents=2500, events_7d=5, cleanups_7d=1)
BUDGET = schemas.BudgetCtx(available_cents=50_000, min_cents=500, max_cents=5000, daily_cap_cents=20_000,
                           spent_today_cents=0)


def event(severity=4, waste_score=0.8, type_="WASTE"):
    return schemas.EventCtx(event_id="e1", type=type_, severity=severity, waste_score=waste_score,
                            summary="Plastic near the ghat", lat=28.6, lon=77.2, created_at="2026-11-10T07:30:00Z")


@pytest.fixture(scope="module")
def ai():
    return RealRiverAI()


def _png(arr) -> bytes:
    out = io.BytesIO()
    Image.fromarray(arr).save(out, format="PNG")
    return out.getvalue()


def _asset(name):
    path = ASSETS / name
    if not path.is_file():
        pytest.skip(f"{name} missing")
    return path.read_bytes()


def test_analyze_media_runs_detector(ai):
    for data in (_asset("demo-before.png"), jpeg("flat"), jpeg("shapes")):
        d = ai.analyze_media(data, "image/png", META)
        assert d.model_version == "yolo11n-rivermind-v2"
        total = d.counts.bottle + d.counts.bag + d.counts.other
        assert len(d.boxes) == total and d.waste_detected == (total > 0)
        assert (d.waste_score > 0) == (total > 0)
        assert all(0 <= v <= 1 for b in d.boxes for v in b.xyxy) and all(b.conf >= 0.25 for b in d.boxes)
        assert d.counts.foam == int(d.foam_ratio > 0.05)


def test_flat_water_has_no_waste(ai):
    d = ai.analyze_media(jpeg("flat"), "image/jpeg", META)
    assert not d.waste_detected and d.waste_score == 0.0 and d.boxes == []


def test_verify_same_scene_matches_and_reports_no_llm(ai):
    rng = np.random.default_rng(0)
    scene = rng.integers(0, 255, (60, 80, 3), dtype=np.uint8).repeat(6, 0).repeat(6, 1)  # blocky 480x360
    shifted = np.roll(scene, 7, axis=1)
    out = ai.verify_cleanup(_png(scene), _png(shifted), schemas.VerifyCtx(bounty_id="b1", prior_phashes=[]))
    assert out.scene_match.passed and out.scene_match.inliers >= 25
    assert "no-llm" in out.model_version and "No vision LLM" in out.llm.notes
    assert out.llm.passed == (out.llm.vote >= 0.6)
    assert len(out.before_phash) == 16 and len(out.after_phash) == 16


def test_verify_count_drop_rule(ai):
    before, after = _asset("demo-before.png"), _asset("demo-after.png")
    out = ai.verify_cleanup(before, after, schemas.VerifyCtx(bounty_id="b1", prior_phashes=[]))
    c = out.count_drop
    assert c.passed == (c.before_count >= 1 and c.after_count <= 0.4 * c.before_count)
    unrelated = ai.verify_cleanup(jpeg("noise", 1), jpeg("flat"), schemas.VerifyCtx(bounty_id="b", prior_phashes=[]))
    assert not unrelated.scene_match.passed


@pytest.mark.parametrize("sev,ws,type_", [(1, 0.0, "WASTE"), (5, 1.0, "WASTE"), (3, 0.0, "SENSOR_ANOMALY")])
def test_propose_bounty_inside_range(sev, ws, type_):
    p = agent.propose_bounty(event(sev, ws, type_), BUDGET)
    assert BUDGET.min_cents <= p.amount_cents <= BUDGET.max_cents and p.model_version == "rules-v1"


def test_propose_bounty_scales_with_severity():
    assert agent.propose_bounty(event(5, 1.0), BUDGET).amount_cents == 5000
    low, high = agent.propose_bounty(event(1, 0.0), BUDGET), agent.propose_bounty(event(4), BUDGET)
    assert low.amount_cents < high.amount_cents


def test_diary_uses_only_input_numbers():
    d = agent.write_diary(STATUS, [event()])
    assert d.numbers_validated and d.model_version == "rules-v1" and "64" in d.text and "$15.00" in d.text
    assert not agent.numbers_ok("My health score is 99 today.", STATUS, [])
    assert agent.numbers_ok("I received $25.00 from donors.", STATUS, [])


def test_invoice_within_max():
    for cap in (0, 999, 50_000):
        inv = agent.draft_invoice(STATUS, "csr-sponsor@example.com", cap)
        assert 0 <= inv.amount_cents <= cap and "example.com" not in inv.rationale
