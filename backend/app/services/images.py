"""Uploads: jpeg/png checked by content, 8 MB cap, re-encoded as JPEG (drops EXIF/GPS), stored <= 1 MB."""
import io

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from app.errors import ApiError

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_STORED_BYTES = 1024 * 1024
MAX_SIDE_PX = 1600
Image.MAX_IMAGE_PIXELS = 50_000_000  # decompression-bomb guard


def read_upload(file: UploadFile) -> bytes:
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise ApiError("PAYLOAD_TOO_LARGE", "Images must be 8 MB or smaller")
    return data


def _bad(field: str) -> ApiError:
    return ApiError("VALIDATION_ERROR", "Some fields are invalid",
                    {"fields": [{"field": field, "reason": "must be a JPEG or PNG image"}]})


def sanitize(data: bytes, field: str = "file") -> bytes:
    """Return a clean JPEG with no metadata. Rejects anything that is not really a JPEG/PNG."""
    try:
        with Image.open(io.BytesIO(data)) as probe:
            if probe.format not in ("JPEG", "PNG"):
                raise _bad(field)
            probe.verify()
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")  # keep orientation, then drop all metadata
            img.thumbnail((MAX_SIDE_PX, MAX_SIDE_PX))
            for quality in (85, 70, 55, 40):
                out = io.BytesIO()
                img.save(out, format="JPEG", quality=quality)
                if out.tell() <= MAX_STORED_BYTES:
                    return out.getvalue()
    except ApiError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise _bad(field) from exc
    raise ApiError("PAYLOAD_TOO_LARGE", "Image is too detailed to store")
