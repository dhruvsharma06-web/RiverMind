import os
import pathlib
import tempfile

# Point the app at a throwaway SQLite file before anything imports app.db.
_tmp = pathlib.Path(tempfile.mkdtemp()) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}"
os.environ.setdefault("USE_MOCK_AI", "true")
os.environ.setdefault("PAYPAL_MODE", "mock")
os.environ.setdefault("DEVICE_TOKEN", "test-device-token")

import pytest
from app import models  # noqa: F401
from app.db import Base, SessionLocal, engine
from app.main import app
from fastapi.testclient import TestClient

FIXTURES = pathlib.Path(__file__).resolve().parents[2] / "fixtures"


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s


@pytest.fixture
def client():
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
