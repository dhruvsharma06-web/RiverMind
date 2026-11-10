"""Image helpers shared by the mock and the real adapter: decoding, perceptual hash, foam ratio, texture."""
import io

import imagehash
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

_ANALYSIS_SIDE = 256  # statistics below run on a small copy; they do not need full resolution

# Foam (CONTRACT.md / P2 S2.1): pale, bright pixels — HSV saturation < 40 and value > 200 on 0-255 scales —
# measured in the lower half of the frame, where the water usually is.
FOAM_MAX_SATURATION = 40
FOAM_MIN_VALUE = 200
FOAM_COUNT_THRESHOLD = 0.05  # counts.foam = 1 when foam_ratio > this


def open_rgb(data: bytes) -> Image.Image:
    """Decode JPEG/PNG bytes into an upright RGB image. Raises ValueError for bytes that are not an image."""
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)  # the backend strips EXIF already; this only matters for laptop tools
        return img.convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("bytes are not a decodable image") from exc


def phash(data: bytes) -> str:
    """64-bit perceptual hash as 16 hex chars; the backend's duplicate check compares these by Hamming distance."""
    return str(imagehash.phash(open_rgb(data)))


def _small(img: Image.Image) -> Image.Image:
    copy = img.copy()
    copy.thumbnail((_ANALYSIS_SIDE, _ANALYSIS_SIDE))
    return copy


def foam_ratio(img: Image.Image) -> float:
    """Share of foam-coloured pixels in the lower half of the image, 0-1."""
    small = _small(img)
    w, h = small.size
    hsv = np.asarray(small.crop((0, h // 2, w, h)).convert("HSV"))
    foam = (hsv[..., 1] < FOAM_MAX_SATURATION) & (hsv[..., 2] > FOAM_MIN_VALUE)
    return round(float(foam.mean()), 4) if foam.size else 0.0


def texture(img: Image.Image) -> float:
    """Mean absolute brightness difference between neighbouring pixels (0-255). Flat water is low; clutter is high."""
    gray = np.asarray(_small(img).convert("L"), dtype=np.float32)
    if gray.shape[0] < 2 or gray.shape[1] < 2:
        return 0.0
    return float((np.abs(np.diff(gray, axis=0)).mean() + np.abs(np.diff(gray, axis=1)).mean()) / 2)
