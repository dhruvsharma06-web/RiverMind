import io
import json
import pathlib

import numpy as np
import pytest
from PIL import Image

FIXTURES = pathlib.Path(__file__).resolve().parents[2] / "fixtures"


def fixture_json(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def jpeg(kind: str, seed: int = 0, size: tuple[int, int] = (320, 240)) -> bytes:
    """Synthetic stand-ins until fixtures/images/ has real photos.
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
