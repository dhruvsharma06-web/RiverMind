"""S0 check: every contract fixture is accepted by the backend's schemas, and nothing is left unmapped."""
import json

import pytest
from app import schemas
from app.errors import ErrorResponse

from tests.conftest import FIXTURES

SCHEMA_FOR = {
    "health.ok.json": schemas.HealthResponse,
    "readings.ok.json": schemas.ReadingsResponse,
    "readings.empty.json": schemas.ReadingsResponse,
    "media_analyze.ok.json": schemas.MediaAnalyzeResponse,
    "media_analyze.clean.json": schemas.MediaAnalyzeResponse,
    "events.ok.json": schemas.EventsResponse,
    "events.empty.json": schemas.EventsResponse,
    "bounties.ok.json": schemas.BountiesResponse,
    "bounties.empty.json": schemas.BountiesResponse,
    "bounty.open.json": schemas.Bounty,
    "bounty.paid.json": schemas.Bounty,
    "bounty.rejected.json": schemas.Bounty,
    "claim.ok.json": schemas.ClaimResponse,
    "proof.verified.json": schemas.ProofResponse,
    "proof.rejected_duplicate.json": schemas.ProofResponse,
    "payouts.ok.json": schemas.PayoutsResponse,
    "payouts.empty.json": schemas.PayoutsResponse,
    "payout_approve.ok.json": schemas.PayoutActionResponse,
    "payout_retry.ok.json": schemas.PayoutActionResponse,
    "payout_veto.ok.json": schemas.PayoutVetoResponse,
    "donation_order.ok.json": schemas.DonationOrderResponse,
    "donation_capture.ok.json": schemas.DonationCaptureResponse,
    "donations.ok.json": schemas.DonationsResponse,
    "river_status.ok.json": schemas.RiverStatusResponse,
    "diary.ok.json": schemas.DiaryResponse,
    "fundraise.ok.json": schemas.FundraiseResponse,
    "demo_reset.ok.json": schemas.ResetResponse,
}
ALL = sorted(p.name for p in FIXTURES.glob("*.json"))


def schema_for(name: str):
    if name.startswith("error.") or name.endswith(".error.json"):
        return ErrorResponse
    return SCHEMA_FOR[name]


def test_every_fixture_has_a_schema():
    assert ALL, f"no fixtures found in {FIXTURES}"
    assert [n for n in ALL if not (n.startswith("error.") or n.endswith(".error.json") or n in SCHEMA_FOR)] == []


@pytest.mark.parametrize("name", ALL)
def test_fixture_round_trips(name):
    data = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
    model = schema_for(name).model_validate(data)
    # Re-serialising gives back the exact fixture (catches renamed fields and non-Z timestamps).
    assert json.loads(model.model_dump_json()) == data


def test_unknown_field_rejected():
    data = json.loads((FIXTURES / "bounty.open.json").read_text(encoding="utf-8"))
    with pytest.raises(ValueError):
        schemas.Bounty.model_validate({**data, "surprise": 1})
