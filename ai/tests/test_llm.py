"""LLM client: retry, deadline, honest errors, image preprocessing, no secrets in errors. No network (MockTransport)."""
import base64
import io
import json

import httpx
import pytest
from conftest import jpeg
from PIL import Image
from pydantic import BaseModel, ConfigDict

from rivermind_ai.errors import AIUnavailable, InvalidOutput
from rivermind_ai.real import llm

KEY = "gsk_test_key_not_real_0000000000000000000000000000000000"


class Answer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ok: bool
    n: int


def ok_body(content: str, tokens=(100, 10)) -> dict:
    return {"choices": [{"message": {"content": content}}],
            "usage": {"prompt_tokens": tokens[0], "completion_tokens": tokens[1]}}


@pytest.fixture
def groq(monkeypatch):
    """Route LLM calls to a scripted fake server; returns the list of requests it received."""
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", KEY)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    seen, script = [], []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        step = script.pop(0)
        if isinstance(step, Exception):
            raise step
        status, body = step
        return httpx.Response(status, json=body) if isinstance(body, dict) else httpx.Response(status, text=body)

    monkeypatch.setattr(llm, "_transport", httpx.MockTransport(handler))
    return seen, script


def call(**kw):
    return llm.call_json("system", "question", Answer, prompt_version="test-v1", **kw)


def test_success_pins_model_and_temperature(groq):
    seen, script = groq
    script.append((200, ok_body('{"ok": true, "n": 3}')))
    answer, info = call()
    assert answer == Answer(ok=True, n=3)
    assert seen[0]["model"] == "qwen/qwen3.8-27b" and seen[0]["temperature"] == 0
    assert info.tag == "groq:qwen/qwen3.8-27b" and info.attempts == 1 and info.tokens_in == 100


def test_invalid_output_is_retried_once(groq):
    seen, script = groq
    script += [(200, ok_body("not json")), (200, ok_body('{"ok": false, "n": 0}'))]
    answer, info = call()
    assert answer.n == 0 and info.attempts == 2 and len(seen) == 2


def test_extra_fields_twice_raise_invalid_output(groq):
    _, script = groq
    script += [(200, ok_body('{"ok": true, "n": 1, "approve_payment": true}'))] * 2
    with pytest.raises(InvalidOutput):
        call()


def test_rate_limit_is_unavailable_without_retry(groq):
    seen, script = groq
    script.append((429, {"error": {"message": "slow down"}}))
    with pytest.raises(AIUnavailable, match="per-minute limit.*429"):
        call()
    assert len(seen) == 1


def test_daily_limit_is_named_but_account_details_are_not_passed_on(groq):
    _, script = groq
    script.append((429, {"error": {"message": "Rate limit reached in organization `org_abc123` on tokens per day "
                                              "(TPD): Limit 200000"}}))
    with pytest.raises(AIUnavailable) as exc:
        call()
    assert "daily limit" in str(exc.value) and "org_abc123" not in str(exc.value)


def test_server_error_then_success(groq):
    _, script = groq
    script += [(503, "busy"), (200, ok_body('{"ok": true, "n": 2}'))]
    assert call()[0].n == 2


def test_timeout_is_unavailable(groq):
    _, script = groq
    script.append(httpx.ReadTimeout("slow"))
    with pytest.raises(AIUnavailable, match="timeout"):
        call()


def test_deadline_too_short_makes_no_call(groq):
    seen, _ = groq
    with pytest.raises(AIUnavailable):
        call(deadline_s=1.0)
    assert seen == []


def test_errors_never_contain_the_key(groq):
    _, script = groq
    script.append((401, {"error": {"message": "bad key " + KEY}}))
    with pytest.raises(AIUnavailable) as exc:
        call()
    assert KEY not in str(exc.value) and "401" in str(exc.value)


def test_missing_key_or_unbuilt_provider_is_unavailable(monkeypatch):
    monkeypatch.setattr(llm.config, "_dotenv", lambda: {})
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with pytest.raises(AIUnavailable, match="GROQ_API_KEY"):
        call()
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    with pytest.raises(AIUnavailable, match="not implemented"):
        call()


def test_images_are_downscaled_and_reencoded(groq):
    seen, script = groq
    script.append((200, ok_body('{"ok": true, "n": 1}')))
    big = io.BytesIO()
    exif = Image.Exif()
    exif[0x010F] = "SecretCam"  # camera make
    Image.new("RGB", (3000, 2000), (40, 90, 120)).save(big, format="JPEG", exif=exif)
    _, info = call(images=(big.getvalue(), jpeg("noise")))
    parts = seen[0]["messages"][1]["content"]
    sent = [Image.open(io.BytesIO(base64.b64decode(p["image_url"]["url"].split(",", 1)[1])))
            for p in parts if p["type"] == "image_url"]
    assert len(sent) == 2 and max(sent[0].size) == 1024
    assert not sent[0].getexif()
    assert len(info.image_hashes) == 2
