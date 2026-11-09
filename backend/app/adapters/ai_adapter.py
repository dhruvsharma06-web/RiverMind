"""The only door from the backend into the AI (`rivermind_ai`, owned by P2). 25 s timeout; failures -> AI_UNAVAILABLE."""
import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from functools import lru_cache
from typing import Any

from app.config import get_settings
from app.errors import ApiError

log = logging.getLogger("rivermind")
AI_TIMEOUT_S = 25

try:  # P2's package; until it is on main we run the labelled stand-in mock.
    from rivermind_ai import schemas as types
    from rivermind_ai.errors import AIUnavailable, InvalidOutput
    from rivermind_ai.factory import get_river_ai
except ImportError:
    from app.adapters import ai_standin as types
    from app.adapters.ai_standin import AIUnavailable, InvalidOutput, StandInMockAI

    def get_river_ai(use_mock: bool):
        return StandInMockAI()

# shortcut: one shared pool of 8 threads caps AI concurrency; S4.3 revisits it under load.
_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="ai")


@lru_cache
def _ai():
    return get_river_ai(get_settings().USE_MOCK_AI)


def call_ai(method: str, *args: Any) -> Any:
    future = _pool.submit(getattr(_ai(), method), *args)
    try:
        return future.result(timeout=AI_TIMEOUT_S)
    except (FutureTimeout, AIUnavailable, InvalidOutput) as exc:
        log.warning("ai call failed", extra={"fields": {"method": method, "error": type(exc).__name__}})
        raise ApiError("AI_UNAVAILABLE", "The AI service is not responding. Please try again.") from exc
    except Exception as exc:  # a bug inside the AI package must not take the API down either
        log.error("ai call crashed", exc_info=exc, extra={"fields": {"method": method}})
        raise ApiError("AI_UNAVAILABLE", "The AI service is not responding. Please try again.") from exc


__all__ = ["call_ai", "types"]
