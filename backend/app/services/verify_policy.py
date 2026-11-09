"""Verification policy (CONTRACT "Verification policy"). Pure functions: no DB, no AI calls.
The AI's per-check `passed` values are used as given; geo, time, duplicate and the overall result are ours."""
from datetime import datetime

from app.geo import haversine_m

GEO_SLACK_M = 150
MIN_HAMMING_PAIR = 3     # before vs after
MIN_HAMMING_PRIOR = 6    # before/after vs every earlier proof image

# Short reason shown as bounty.rejection_reason, in priority order (duplicate first: it is the demo's fake-photo case).
LABELS = {
    "duplicate": "duplicate photo",
    "manipulation": "photo looks edited or is a photo of a screen",
    "geo": "photos taken too far from the bounty",
    "time": "photos were not taken after the claim, before photo first",
    "scene_match": "before and after do not show the same place",
    "count_drop": "waste count did not drop",
    "llm": "AI reviewer was not convinced",
}


def hamming(a: str, b: str) -> int:
    return (int(a, 16) ^ int(b, 16)).bit_count()


def geo_check(bounty_lat: float, bounty_lon: float, radius_m: int, lat: float, lon: float) -> dict:
    d = haversine_m(bounty_lat, bounty_lon, lat, lon)
    return {"passed": d <= radius_m + GEO_SLACK_M, "distance_m": round(d, 1), "source": "browser"}


def time_check(before_at: datetime, after_at: datetime, claimed_at: datetime) -> dict:
    """Both photos taken after the claim, before photo first. No upper time limit: claims never lapse."""
    return {"passed": claimed_at <= before_at < after_at}


def duplicate_check(before: str, after: str, prior: list[str]) -> dict:
    pair = hamming(before, after)
    vs_prior = [hamming(x, p) for x in (before, after) for p in prior]
    passed = pair >= MIN_HAMMING_PAIR and all(h >= MIN_HAMMING_PRIOR for h in vs_prior)
    return {"passed": passed, "nearest_hamming": min([pair, *vs_prior])}


def decide(ai: dict, geo: dict, time: dict, duplicate: dict) -> tuple[bool, float, dict, list[str], str | None]:
    """ai = VerificationScores as a dict. Returns (passed, score, checks, reasons, rejection_reason)."""
    checks = {
        "geo": geo, "time": time, "duplicate": duplicate,
        "scene_match": ai["scene_match"], "count_drop": ai["count_drop"], "llm": ai["llm"],
        "manipulation": ai["manipulation"],
        "sensor": {"passed": None, "turbidity_delta": None},  # context only, never decides
    }
    failed = [k for k in LABELS if (checks[k]["flagged"] if k == "manipulation" else not checks[k]["passed"])]
    before_n, after_n = ai["count_drop"]["before_count"], ai["count_drop"]["after_count"]
    parts = (ai["llm"]["vote"], min(1.0, ai["scene_match"]["inliers"] / 50), 1 - after_n / max(before_n, 1))
    score = round(min(1.0, max(0.0, sum(parts) / 3)), 2)  # display only; clamped because after > before goes negative
    reasons = [LABELS[k] for k in failed] or ["All checks passed"]
    return not failed, score, checks, reasons, (LABELS[failed[0]] if failed else None)
