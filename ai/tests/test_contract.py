"""S1.1: the schemas accept the contract fixtures, reject unknown fields, and mock outputs have fixture shapes."""
import pytest
from conftest import fixture_json, jpeg
from pydantic import ValidationError

from rivermind_ai import schemas
from rivermind_ai.errors import AIUnavailable, InvalidOutput, RiverAIError
from rivermind_ai.interface import RiverAI

META = schemas.MediaMeta(lat=28.5355, lon=77.31, captured_at="2026-11-10T07:30:00Z", source="camera")
STATUS = schemas.RiverStatusCtx(health_score=64, trend="improving", open_bounties=2, paid_cents=1500,
                                donated_cents=2500, events_7d=5, cleanups_7d=1)


@pytest.mark.parametrize("name", ["media_analyze.ok.json", "media_analyze.clean.json"])
def test_fixture_detections_validate(name):
    schemas.Detection.model_validate(fixture_json(name)["analysis"])


@pytest.mark.parametrize("name", ["proof.verified.json", "proof.rejected_duplicate.json"])
def test_fixture_ai_checks_validate(name):
    checks = fixture_json(name)["verification"]["checks"]
    schemas.SceneMatch.model_validate(checks["scene_match"])
    schemas.CountDrop.model_validate(checks["count_drop"])
    schemas.LlmVote.model_validate(checks["llm"])
    schemas.Manipulation.model_validate(checks["manipulation"])


def test_fixture_diary_fields_validate():
    d = fixture_json("diary.ok.json")
    schemas.DiaryEntry(text=d["text"], mood=d["mood"], numbers_validated=True, model_version=d["model_version"])


def test_unknown_fields_are_rejected():
    analysis = fixture_json("media_analyze.ok.json")["analysis"] | {"approve_payment": True}
    with pytest.raises(ValidationError):
        schemas.Detection.model_validate(analysis)


def test_out_of_range_values_are_rejected():
    analysis = fixture_json("media_analyze.ok.json")["analysis"]
    with pytest.raises(ValidationError):
        schemas.Detection.model_validate(analysis | {"waste_score": 1.5})
    with pytest.raises(ValidationError):
        schemas.Detection.model_validate(analysis | {"boxes": [{"xyxy": [0.1, 0.2], "cls": "bottle", "conf": 0.5}]})
    with pytest.raises(ValidationError):
        schemas.Detection.model_validate(analysis | {"boxes": [{"xyxy": [0, 0, 1, 1], "cls": "tyre", "conf": 0.5}]})


def test_mock_detection_has_fixture_shape(mock_ai):
    out = mock_ai.analyze_media(jpeg("noise"), "image/jpeg", META).model_dump()
    fixture = fixture_json("media_analyze.ok.json")["analysis"]
    assert out.keys() == fixture.keys()
    assert out["counts"].keys() == fixture["counts"].keys()
    assert out["boxes"] and out["boxes"][0].keys() == fixture["boxes"][0].keys()
    assert out["model_version"] == "mock-1"


def test_mock_verification_has_fixture_shape(mock_ai):
    out = mock_ai.verify_cleanup(jpeg("noise", 1), jpeg("flat"), schemas.VerifyCtx(bounty_id="b1", prior_phashes=[]))
    checks = fixture_json("proof.verified.json")["verification"]["checks"]
    for key in ("scene_match", "count_drop", "llm", "manipulation"):
        assert getattr(out, key).model_dump().keys() == checks[key].keys()


def test_mock_diary_and_invoice_have_contract_shape(mock_ai):
    diary = mock_ai.write_diary(STATUS, [])
    assert diary.mood in ("hopeful", "worried", "grateful") and diary.model_version == "mock-1"
    assert mock_ai.draft_invoice(STATUS, "csr-sponsor@example.com", 50_000).amount_cents <= 50_000


def test_factory_returns_protocol_implementations():
    from rivermind_ai.factory import get_river_ai

    assert isinstance(get_river_ai(True), RiverAI)
    assert isinstance(get_river_ai(False), RiverAI)


def test_real_adapter_fails_honestly_on_bad_input():
    from rivermind_ai.factory import get_river_ai

    real = get_river_ai(False)
    with pytest.raises(AIUnavailable):
        real.analyze_media(b"not an image", "image/jpeg", META)
    assert len(real.phash(jpeg("noise"))) == 16


def test_error_types_share_a_base():
    assert issubclass(AIUnavailable, RiverAIError) and issubclass(InvalidOutput, RiverAIError)
