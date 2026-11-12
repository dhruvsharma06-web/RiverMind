import io
import json
import os
import pathlib

import numpy as np
import pytest
from PIL import Image

FIXTURES = pathlib.Path(__file__).resolve().parents[2] / "fixtures"
ASSETS = pathlib.Path(__file__).resolve().parent / "assets"
_LLM_ENV = ("LLM_PROVIDER", "LLM_MODEL", "GROQ_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "AI_DETECTOR",
            "DETECTOR_MODEL_PATH", "ANOMALY_MAX_TURBIDITY_NTU")


@pytest.fixture(autouse=True)
def _no_real_secrets(monkeypatch, request):
    """Tests never see the developer's .env or real API keys, so nothing reaches a paid/rate-limited API by accident.
    Opt out only with @pytest.mark.live (and RIVERMIND_LIVE_LLM=1)."""
    if request.node.get_closest_marker("live"):
        yield
        return
    from rivermind_ai import config

    monkeypatch.setattr(config, "_dotenv", lambda: {})
    for name in _LLM_ENV:
        monkeypatch.delenv(name, raising=False)
    yield


def pytest_configure(config):
    config.addinivalue_line("markers", "live: calls the real LLM provider; needs RIVERMIND_LIVE_LLM=1 and a key")


def live_enabled() -> bool:
    return os.environ.get("RIVERMIND_LIVE_LLM") == "1"


def fixture_json(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def asset(name: str) -> bytes:
    return (ASSETS / f"{name}.jpg").read_bytes()


def cleaned_asset(name: str, grow: float = 1.3) -> bytes:
    """The asset with its labelled floating-waste boxes digitally removed (OpenCV inpainting) — a SIMULATED cleanup."""
    import cv2

    img = cv2.imdecode(np.frombuffer(asset(name), np.uint8), cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    for line in (ASSETS / f"{name}.txt").read_text().splitlines():
        parts = line.split()
        if len(parts) == 5 and parts[0] == "0":
            cx, cy, bw, bh = (float(v) for v in parts[1:])
            bw, bh = bw * grow, bh * grow
            mask[max(0, int((cy - bh / 2) * h)):int((cy + bh / 2) * h),
                 max(0, int((cx - bw / 2) * w)):int((cx + bw / 2) * w)] = 255
    out = cv2.inpaint(img, mask, 7, cv2.INPAINT_TELEA)
    return cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 92])[1].tobytes()


def jpeg(kind: str, seed: int = 0, size: tuple[int, int] = (320, 240)) -> bytes:
    """Synthetic stand-ins for mock tests.
    noise: high texture (clutter) · flat: still blue water · foam: flat water with a white lower half
    shapes: flat water with a few random coloured rectangles (a crude 'littered' scene)."""
    w, h = size
    rng = np.random.default_rng(seed)
    if kind == "noise":
        arr = rng.integers(0, 255, (h, w, 3), dtype=np.uint8)
    else:
        arr = np.zeros((h, w, 3), dtype=np.uint8)
        arr[...] = (40, 90, 120)
        if kind == "foam":
            arr[h // 2:] = (245, 245, 240)
        elif kind == "shapes":
            for _ in range(40):
                x, y = rng.integers(0, w - 20), rng.integers(h // 3, h - 12)
                arr[y:y + rng.integers(4, 12), x:x + rng.integers(6, 20)] = rng.integers(0, 255, 3)
    out = io.BytesIO()
    Image.fromarray(arr).save(out, format="JPEG", quality=90)
    return out.getvalue()


@pytest.fixture
def mock_ai():
    from rivermind_ai.factory import get_river_ai

    return get_river_ai(True)
