"""S0.3: mock behaviour — deterministic, image-dependent, budget-respecting, numbers only from inputs."""
import re

import pytest
from conftest import FIXTURES, jpeg

from rivermind_ai import imaging, schemas
from rivermind_ai.mock import MockRiverAI

META = schemas.MediaMeta(source="upload")


def hamming(a: str, b: str) -> int:
    return (int(a, 16) ^ int(b, 16)).bit_count()


def reading(turbidity: float, minute: int = 0) -> schemas.SensorReading:
    return schemas.SensorReading(ts=f"2026-11-10T07:{minute:02d}:00Z", turbidity_ntu=turbidity, ph=7.4,
                                 tds_ppm=600.0, temp_c=24.0)


def test_analyze_is_deterministic(mock_ai):
    data = jpeg("shapes", 3)
    assert mock_ai.analyze_media(data, "image/jpeg", META) == mock_ai.analyze_media(data, "image/jpeg", META)


def test_cluttered_image_is_waste_and_flat_water_is_clean(mock_ai):
    waste = mock_ai.analyze_media(jpeg("noise"), "image/jpeg", META)
    clean = mock_ai.analyze_media(jpeg("flat"), "image/jpeg", META)
    assert waste.waste_score >= 0.5 and waste.waste_detected
    assert clean.waste_score < 0.5 and not clean.waste_detected and clean.boxes == []
    assert sum((clean.counts.bottle, clean.counts.bag, clean.counts.other)) == 0


def test_different_images_give_different_scores(mock_ai):
    scores = {mock_ai.analyze_media(jpeg(k, 5), "image/jpeg", META).waste_score for k in ("noise", "flat", "shapes")}
    assert len(scores) == 3


def test_foam_uses_the_real_hsv_rule(mock_ai):
    out = mock_ai.analyze_media(jpeg("foam"), "image/jpeg", META)
    assert out.foam_ratio > imaging.FOAM_COUNT_THRESHOLD and out.counts.foam == 1
    assert mock_ai.analyze_media(jpeg("flat"), "image/jpeg", META).counts.foam == 0


def test_boxes_are_normalised_and_ordered(mock_ai):
    for box in mock_ai.analyze_media(jpeg("noise", 2), "image/jpeg", META).boxes:
        x1, y1, x2, y2 = box.xyxy
        assert 0 <= x1 < x2 <= 1 and 0 <= y1 < y2 <= 1


@pytest.mark.parametrize("name,waste", [("waste.jpg", True), ("clean.jpg", False)])
def test_fixture_photos_when_present(mock_ai, name, waste):
    path = FIXTURES / "images" / name
    if not path.exists():
        pytest.skip(f"fixtures/images/{name} not added yet (Dhruv S0.5)")
    score = mock_ai.analyze_media(path.read_bytes(), "image/jpeg", META).waste_score
    assert (score >= 0.5) is waste


def test_fixture_before_after_hamming_when_present(mock_ai):
    before, after = FIXTURES / "images" / "before.jpg", FIXTURES / "images" / "after.jpg"
    if not (before.exists() and after.exists()):
        pytest.skip("fixtures/images/before.jpg + after.jpg not added yet (Dhruv S0.5)")
    assert hamming(mock_ai.phash(before.read_bytes()), mock_ai.phash(after.read_bytes())) >= 3


def test_phash_is_real():
    ai = MockRiverAI()
    a, b = jpeg("noise", 1), jpeg("noise", 2)
    assert re.fullmatch(r"[0-9a-f]{16}", ai.phash(a))
    assert ai.phash(a) == ai.phash(a)
    assert hamming(ai.phash(a), ai.phash(b)) >= 6


def test_verify_returns_passing_scores_with_real_phashes(mock_ai):
    before, after = jpeg("noise", 1), jpeg("flat")
    out = mock_ai.verify_cleanup(before, after, schemas.VerifyCtx(bounty_id="b1", prior_phashes=[]))
    assert out.scene_match.passed and out.count_drop.passed and out.llm.passed and not out.manipulation.flagged
    assert out.before_phash == mock_ai.phash(before) and out.after_phash == mock_ai.phash(after)
    assert not hasattr(out, "passed")  # the overall decision belongs to the backend


def test_identical_photos_get_identical_hashes_for_the_backend_duplicate_check(mock_ai):
    photo = jpeg("shapes", 9)
    out = mock_ai.verify_cleanup(photo, photo, schemas.VerifyCtx(bounty_id="b1", prior_phashes=[]))
    assert hamming(out.before_phash, out.after_phash) == 0


def test_sensor_spike_is_flagged_with_a_reason(mock_ai):
    history = [reading(20 + i % 3, i) for i in range(10)]
    spike = mock_ai.detect_sensor_anomaly(reading(85, 10), history)
    assert spike.anomaly and spike.sensor == "turbidity" and 0 < spike.score <= 1 and "NTU" in spike.reason
    assert not mock_ai.detect_sensor_anomaly(reading(24, 10), history).anomaly


def test_sensor_needs_history(mock_ai):
    assert not mock_ai.detect_sensor_anomaly(reading(500), [reading(20)]).anomaly


@pytest.mark.parametrize("max_cents", [5000, 1200])
def test_bounty_amount_stays_inside_the_range(mock_ai, max_cents):
    budget = schemas.BudgetCtx(available_cents=50_000, min_cents=500, max_cents=max_cents, daily_cap_cents=20_000,
                               spent_today_cents=0)
    for severity in range(1, 6):
        event = schemas.EventCtx(event_id="e1", type="WASTE", severity=severity, waste_score=0.8, summary="bottles",
                                 lat=28.5, lon=77.3, created_at="2026-11-10T07:30:00Z")
        proposal = mock_ai.propose_bounty(event, budget)
        assert proposal.amount_cents == max(500, min(max_cents, 500 * severity))


def _numbers(text: str) -> set[str]:
    return set(re.findall(r"\d+(?:,\d{3})*(?:\.\d+)?", text))


def test_diary_only_uses_numbers_from_its_inputs(mock_ai):
    status = schemas.RiverStatusCtx(health_score=64, trend="stable", open_bounties=2, paid_cents=1500,
                                    donated_cents=123_456, events_7d=5, cleanups_7d=1)
    allowed = {str(v) for v in (64, 2, 5, 1, 100)} | {"15.00", "1,234.56"}
    assert _numbers(mock_ai.write_diary(status, []).text) <= allowed


def test_invoice_is_capped(mock_ai):
    status = schemas.RiverStatusCtx(health_score=50, trend="worsening", open_bounties=0, paid_cents=0,
                                    donated_cents=0, events_7d=0, cleanups_7d=0)
    assert mock_ai.draft_invoice(status, "x@example.com", 3000).amount_cents == 3000
    assert mock_ai.draft_invoice(status, "x@example.com", 50_000).amount_cents == 10_000
