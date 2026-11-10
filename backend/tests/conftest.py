import os
import pathlib
import tempfile

# Point the app at a throwaway SQLite file before anything imports app.db.
_tmp = pathlib.Path(tempfile.mkdtemp()) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}"
os.environ.setdefault("USE_MOCK_AI", "true")
os.environ.setdefault("PAYPAL_MODE", "mock")
os.environ.setdefault("DEVICE_TOKEN", "test-device-token")
os.environ.setdefault("COUNCIL_API_KEY", "test-council-key")
os.environ.setdefault("CAMERA_LAT", "28.6000")
os.environ.setdefault("CAMERA_LON", "77.2000")

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


COUNCIL = {"Authorization": "Bearer test-council-key"}
DEVICE = {"X-Device-Token": "test-device-token"}


def register_user(c, email="worker@example.com", name="Worker", password="correct horse"):
    r = c.post("/api/v1/auth/register", json={"name": name, "email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()["token"]


def worker_headers(c):
    """Authorization header for a worker account, registered once per client (the tests' signed-in user)."""
    if not hasattr(c, "_worker_headers"):
        c._worker_headers = {"Authorization": f"Bearer {register_user(c)}"}
    return c._worker_headers


def jpeg(seed: int, size: int = 64) -> bytes:
    """A random-noise JPEG: different seeds give clearly different perceptual hashes."""
    import io

    import numpy as np
    from PIL import Image

    rng = np.random.default_rng(seed)
    img = Image.fromarray(rng.integers(0, 255, (size, size, 3), dtype=np.uint8))
    out = io.BytesIO()
    img.save(out, format="JPEG")
    return out.getvalue()


@pytest.fixture
def seeded(client):
    assert client.post("/api/v1/demo/reset", headers=COUNCIL).json() == {"reset": True}
    return client


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    from app.hardening import reset_rate_limits

    reset_rate_limits()
    from app.adapters import ai_adapter

    ai_adapter._usage.update(day=None, calls=0)
    yield


def ai_impl():
    """The AI class the adapter really uses (rivermind_ai's mock, or the stand-in if that package is absent)."""
    from app.adapters import ai_adapter

    return type(ai_adapter._ai())


REAL_AI = os.environ.get("USE_MOCK_AI", "true").lower() == "false"


def pytest_configure(config):
    config.addinivalue_line("markers", "real_vision: in real-AI mode, keep the real analyze_media/verify_cleanup")


@pytest.fixture(autouse=True)
def _mock_vision_on_synthetic_images(request, monkeypatch):
    """Real-AI mode only. These backend tests upload random-noise JPEGs and need a "waste found" / "cleanup passed"
    verdict to exercise money flows; the real detector rightly finds no waste in noise. So the two image verdicts
    (analyze_media, verify_cleanup) come from rivermind_ai's labelled mock here; every other method stays real.
    The real vision path is tested in ai/tests/test_real.py. Opt out with @pytest.mark.real_vision."""
    if not REAL_AI or request.node.get_closest_marker("real_vision"):
        yield
        return
    from rivermind_ai.mock import MockRiverAI

    impl = ai_impl()
    monkeypatch.setattr(impl, "analyze_media", MockRiverAI.analyze_media)
    monkeypatch.setattr(impl, "verify_cleanup", MockRiverAI.verify_cleanup)
    yield
