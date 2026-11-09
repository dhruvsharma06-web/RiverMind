import os
import pathlib
import tempfile

import pytest
from alembic import command
from alembic.config import Config
from app.config import Settings, get_settings
from app.db import Base
from app.geo import haversine_m
from app.models import Bounty, Device, DiaryEntry, Event, LedgerEntry
from app.security import sha256_hex
from app.seed import DEVICE_REF, reset_demo
from sqlalchemy import create_engine, inspect, select


def test_health_ok(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "version": "1.0", "mock_ai": True, "paypal_mode": "mock", "db": "ok"}
    assert r.headers["x-request-id"]


def test_unknown_route_uses_contract_error_shape(client):
    r = client.get("/api/v1/nope")
    assert r.status_code == 404
    assert r.json() == {"error": {"code": "NOT_FOUND", "message": "Not Found", "details": {}}}


def test_wrong_method_uses_contract_error_shape(client):
    r = client.post("/api/v1/health")
    assert r.status_code == 405
    assert r.json()["error"]["code"] == "NOT_FOUND"


def test_crash_hides_stack_trace(client):
    from app.main import app

    @app.get("/api/v1/_boom")
    def boom():
        raise RuntimeError("secret internals")

    try:
        r = client.get("/api/v1/_boom")
    finally:
        app.router.routes.pop()
    assert r.status_code == 500
    assert r.json() == {"error": {"code": "INTERNAL", "message": "Something went wrong on our side", "details": {}}}
    assert "secret" not in r.text


def test_validation_error_shape(client):
    from app.main import app
    from fastapi import Query

    @app.get("/api/v1/_needs_int")
    def needs_int(n: int = Query()):
        return {}

    try:
        r = client.get("/api/v1/_needs_int?n=abc")
    finally:
        app.router.routes.pop()
    assert r.status_code == 422
    body = r.json()["error"]
    assert body["code"] == "VALIDATION_ERROR"
    assert body["details"]["fields"][0]["field"] == "n"


def test_cors_allows_only_configured_origin(client):
    ok = client.options("/api/v1/health", headers={"Origin": "http://localhost:3000",
                                                   "Access-Control-Request-Method": "GET"})
    bad = client.options("/api/v1/health", headers={"Origin": "https://evil.example",
                                                    "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert "access-control-allow-origin" not in bad.headers


@pytest.mark.parametrize("env, msg", [
    ({"CORS_ORIGINS": "*"}, "exact origins"),
    ({"MIN_BOUNTY_CENTS": "6000"}, "MIN_BOUNTY_CENTS"),
    ({"CAMERA_LAT": "28.5"}, "CAMERA_LAT"),
    ({"PAYPAL_MODE": "sandbox", "PAYPAL_CLIENT_ID": ""}, "PAYPAL_MODE=sandbox"),
    ({"PAYPAL_MODE": "live"}, "PAYPAL_MODE"),
])
def test_bad_settings_rejected(monkeypatch, env, msg):
    monkeypatch.delenv("PAYPAL_CLIENT_ID", raising=False)
    monkeypatch.delenv("PAYPAL_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("CAMERA_LAT", raising=False)
    monkeypatch.delenv("CAMERA_LON", raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    with pytest.raises(ValueError, match=msg):
        Settings(_env_file=None)


def test_seed_matches_contract(db):
    settings = get_settings().model_copy(update={"CAMERA_LAT": 28.7120, "CAMERA_LON": 77.2310})  # on top of candidate 1
    reset_demo(db, settings)
    reset_demo(db, settings)  # reset twice: must wipe, not duplicate

    device = db.get(Device, settings.DEVICE_ID)
    assert device.token_hash == sha256_hex("test-device-token")
    events = db.scalars(select(Event)).all()
    bounties = db.scalars(select(Bounty)).all()
    assert len(events) == 2 and len(bounties) == 1 and db.scalars(select(DiaryEntry)).all()
    assert bounties[0].status == "OPEN"
    for e in events:
        assert haversine_m(e.lat, e.lon, *DEVICE_REF) >= 2000
        assert haversine_m(e.lat, e.lon, settings.CAMERA_LAT, settings.CAMERA_LON) >= 2000
    kinds = {(e.kind, e.amount_cents) for e in db.scalars(select(LedgerEntry))}
    assert kinds == {("SEED", settings.SEED_TREASURY_CENTS), ("RESERVE", bounties[0].amount_cents)}


def test_alembic_migration_matches_models():
    db_path = pathlib.Path(tempfile.mkdtemp()) / "mig.db"
    url = f"sqlite:///{db_path}"
    cfg = Config(str(pathlib.Path(__file__).resolve().parents[1] / "alembic.ini"))
    cfg.attributes["url"] = url
    command.upgrade(cfg, "head")
    insp = inspect(create_engine(url))
    assert set(insp.get_table_names()) - {"alembic_version"} == set(Base.metadata.tables)
    command.check(cfg)  # raises if the models and the migrations disagree
    assert os.path.exists(db_path)
