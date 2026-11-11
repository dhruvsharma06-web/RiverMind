"""Vision-LLM client shared by verify_cleanup, propose_bounty and write_diary.

- Provider from LLM_PROVIDER. Implemented: `groq` (OpenAI-compatible API). `anthropic` / `gemini` are reserved
  backup names but NOT implemented yet (no keys to test them) — selecting them raises AIUnavailable, honestly.
- Model pinned: LLM_MODEL or DEFAULT_MODEL; temperature 0.
- Images: downscaled to <= 1024 px and re-encoded as JPEG (this also strips EXIF) before leaving the server.
- Output: one JSON object validated against a pydantic schema (extra fields rejected). Invalid → one retry →
  InvalidOutput.
- Time: one deadline (default 15 s) covers both attempts. Timeouts, network errors, HTTP 429/5xx → AIUnavailable.
- Logs: model, prompt version, image sha256 prefixes, latency, token counts, outcome. Never keys, image bytes or
  prompt text.
"""
import base64
import hashlib
import io
import json
import logging
import time
from dataclasses import dataclass, field
from typing import TypeVar

import httpx
from PIL import Image
from pydantic import BaseModel, ValidationError

from rivermind_ai import config, imaging
from rivermind_ai.errors import AIUnavailable, InvalidOutput

log = logging.getLogger("rivermind_ai.llm")

DEFAULT_MODEL = "qwen/qwen3.8-27b"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MAX_IMAGE_SIDE = 1024
DEFAULT_DEADLINE_S = 15.0
MIN_ATTEMPT_S = 2.0  # don't start an attempt with less time than this left
_transport: httpx.BaseTransport | None = None  # tests inject httpx.MockTransport here
T = TypeVar("T", bound=BaseModel)


@dataclass
class CallInfo:
    provider: str
    model: str
    prompt_version: str
    attempts: int = 0
    latency_s: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0
    image_hashes: list[str] = field(default_factory=list)

    @property
    def tag(self) -> str:
        """For model_version strings, e.g. 'groq:qwen/qwen3.8-27b'."""
        return f"{self.provider}:{self.model}"


def settings() -> tuple[str, str, str | None]:
    provider = (config.get("LLM_PROVIDER") or "groq").lower()
    model = config.get("LLM_MODEL") or DEFAULT_MODEL
    key = config.get({"groq": "GROQ_API_KEY", "anthropic": "ANTHROPIC_API_KEY", "gemini": "GEMINI_API_KEY"}
                     .get(provider, "GROQ_API_KEY"))
    return provider, model, key


def _jpeg_data_uri(data: bytes) -> tuple[str, str]:
    img = imaging.open_rgb(data)
    img.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)  # fresh encode: no EXIF, no metadata
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode(), hashlib.sha256(data).hexdigest()[:12]


def call_json(system: str, text: str, schema: type[T], *, images: tuple[bytes, ...] = (), prompt_version: str,
              max_tokens: int = 400, deadline_s: float = DEFAULT_DEADLINE_S) -> tuple[T, CallInfo]:
    """Ask the LLM for one JSON object matching `schema`. Raises AIUnavailable or InvalidOutput, never returns junk."""
    provider, model, key = settings()
    if provider != "groq":
        raise AIUnavailable(f"LLM provider '{provider}' is not implemented yet")
    if not key:
        raise AIUnavailable("GROQ_API_KEY is not set")
    info = CallInfo(provider=provider, model=model, prompt_version=prompt_version)
    content: list[dict] = [{"type": "text", "text": text}]
    for data in images:
        uri, digest = _jpeg_data_uri(data)
        content.append({"type": "image_url", "image_url": {"url": uri}})
        info.image_hashes.append(digest)
    body = {"model": model, "temperature": 0, "max_completion_tokens": max_tokens,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}]}

    start = time.monotonic()
    problem = "no attempt made"
    with httpx.Client(transport=_transport) as client:
        for attempt in (1, 2):
            remaining = deadline_s - (time.monotonic() - start)
            if remaining < MIN_ATTEMPT_S:
                break
            info.attempts = attempt
            try:
                r = client.post(GROQ_URL, json=body, headers={"Authorization": f"Bearer {key}"}, timeout=remaining)
            except httpx.TimeoutException:
                problem = "timeout"
                break
            except httpx.HTTPError as exc:
                problem = f"network error ({type(exc).__name__})"
                continue
            if r.status_code == 429:
                problem = "rate limited (HTTP 429)"
                break  # the wait Groq asks for is longer than our deadline
            if r.status_code in (401, 403):
                problem = f"provider rejected the API key (HTTP {r.status_code})"
                break
            if 400 <= r.status_code < 500:
                problem = f"request refused (HTTP {r.status_code})"
                break  # the same request would be refused again
            if r.status_code != 200:
                problem = f"HTTP {r.status_code}"
                continue
            try:
                payload = r.json()
            except json.JSONDecodeError:
                problem = "provider sent a non-JSON response"
                continue
            usage = payload.get("usage") or {}
            info.tokens_in += int(usage.get("prompt_tokens") or 0)
            info.tokens_out += int(usage.get("completion_tokens") or 0)
            try:
                raw = payload["choices"][0]["message"]["content"]
                parsed = schema.model_validate(json.loads(raw))
            except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValidationError):
                problem = "invalid output"
                continue
            info.latency_s = round(time.monotonic() - start, 3)
            _log(info, "ok")
            return parsed, info
    info.latency_s = round(time.monotonic() - start, 3)
    _log(info, problem)
    if problem == "invalid output":
        raise InvalidOutput(f"LLM output failed the schema after {info.attempts} attempts")
    raise AIUnavailable(f"LLM unavailable: {problem}")


def _log(info: CallInfo, outcome: str) -> None:
    log.info("llm call", extra={"fields": {
        "provider": info.provider, "model": info.model, "prompt_version": info.prompt_version,
        "attempts": info.attempts, "latency_s": info.latency_s, "tokens_in": info.tokens_in,
        "tokens_out": info.tokens_out, "images": info.image_hashes, "outcome": outcome}})
