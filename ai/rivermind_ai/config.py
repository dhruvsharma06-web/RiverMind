"""Settings for the real adapter. Real environment variables win; for local runs we also read `../.env` and `.env`
relative to the working directory, the same files the backend reads (later file wins; empty values count as unset).
Secrets are never logged or returned in errors."""
import os
from functools import lru_cache
from pathlib import Path

ENV_FILES = (Path("../.env"), Path(".env"))


@lru_cache
def _dotenv() -> dict[str, str]:
    values: dict[str, str] = {}
    for path in ENV_FILES:
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.removeprefix("export ").strip(), value.strip().strip("'\"")
            if value:
                values[key] = value
    return values


def get(name: str, default: str | None = None) -> str | None:
    return os.environ.get(name) or _dotenv().get(name) or default


def get_float(name: str, default: float) -> float:
    value = get(name)
    try:
        return float(value) if value is not None else default
    except ValueError:
        return default
