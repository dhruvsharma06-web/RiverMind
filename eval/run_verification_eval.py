"""F6 eval: cleanup verification on SIMULATED before/after pairs from held-out frames. One command:

    python eval/run_verification_eval.py            (from the repo root, with the project venv)

Needs the [real] extra, GROQ_API_KEY in the environment or .env, and the Mendeley dataset zip (downloaded and
checksum-verified automatically if missing). Uses the REAL verify_cleanup (our ONNX detector + ORB + the vision LLM)
and the CONTRACT "Verification policy" for the overall decision; geo and time are taken as passed (they come from
the phone's location and clock, not from the photos). Free-tier rate limits are handled by waiting and retrying.

Writes eval/verification/{results.json, summary.md, confusion_matrix.png}.
"""
import argparse
import json
import logging
import os
import statistics
import sys
import time
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import imagehash
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pairs as P
from rivermind_ai import config
from rivermind_ai.errors import AIUnavailable, InvalidOutput
from rivermind_ai.real import vision
from rivermind_ai.schemas import VerifyCtx

OUT = Path(__file__).resolve().parent / "verification"
MIN_HAMMING_PAIR, MIN_HAMMING_PRIOR = 3, 6  # CONTRACT duplicate rule (backend)


class _LlmLog(logging.Handler):
    """Collects the LLM client's own per-call log records (latency, tokens) — no prompt text, no keys."""

    def __init__(self):
        super().__init__()
        self.calls: list[dict] = []

    def emit(self, record):
        self.calls.append(getattr(record, "fields", {}))


def phash_hex(jpeg: bytes) -> str:
    from io import BytesIO

    return str(imagehash.phash(Image.open(BytesIO(jpeg)).convert("RGB")))


def hamming(a: str, b: str) -> int:
    return (int(a, 16) ^ int(b, 16)).bit_count()


def decide(scores, prior: list[str]) -> tuple[bool, list[str]]:
    """CONTRACT 'Verification policy' as the backend applies it (geo/time = pass in this offline eval)."""
    b, a = scores.before_phash, scores.after_phash
    duplicate_ok = hamming(b, a) >= MIN_HAMMING_PAIR and all(hamming(x, p) >= MIN_HAMMING_PRIOR
                                                             for x in (b, a) for p in prior)
    failed = [name for name, ok in (("duplicate", duplicate_ok), ("manipulation", not scores.manipulation.flagged),
                                    ("scene_match", scores.scene_match.passed),
                                    ("count_drop", scores.count_drop.passed), ("llm", scores.llm.passed)) if not ok]
    return not failed, failed


def verify_with_retry(pair: P.Pair, prior: list[str], log: _LlmLog, max_wait_s: float) -> tuple[object, float, int]:
    waited, retries = 0.0, 0
    while True:
        n_before = len(log.calls)
        start = time.monotonic()
        try:
            scores = vision.verify_cleanup(pair.before, pair.after, VerifyCtx(bounty_id=pair.pair_id,
                                                                             prior_phashes=prior))
            return scores, time.monotonic() - start, retries
        except AIUnavailable as exc:
            rate_limited = "429" in str(exc) or (log.calls[n_before:] and "429" in str(log.calls[-1].get("outcome")))
            if not rate_limited or "daily limit" in str(exc) or waited >= max_wait_s:
                raise  # a daily limit won't clear by waiting a few seconds
            retries += 1
            time.sleep(30)
            waited += 30


def confusion_png(tp: int, fn: int, fp: int, tn: int, path: Path) -> None:
    img = Image.new("RGB", (560, 400), "white")
    d = ImageDraw.Draw(img)
    try:
        font, small = ImageFont.truetype("arial.ttf", 22), ImageFont.truetype("arial.ttf", 15)
    except OSError:
        font = small = ImageFont.load_default()
    d.text((20, 12), "Cleanup verification (simulated pairs)", fill="black", font=font)
    d.text((200, 60), "decided: accept", fill="black", font=small)
    d.text((380, 60), "decided: reject", fill="black", font=small)
    d.text((20, 140), "should accept", fill="black", font=small)
    d.text((20, 280), "should reject", fill="black", font=small)
    cells = (((180, 90), tp, "correct", "#cfe9d4"), ((360, 90), fn, "false reject", "#f6e2b3"),
             ((180, 230), fp, "FALSE ACCEPT", "#f3c2c2"), ((360, 230), tn, "correct", "#cfe9d4"))
    for (x, y), n, label, color in cells:
        d.rectangle((x, y, x + 160, y + 120), fill=color, outline="black")
        d.text((x + 64, y + 30), str(n), fill="black", font=font)
        d.text((x + 12, y + 80), label, fill="black", font=small)
    img.save(path)


def pct(sorted_values: list[float], q: float) -> float:
    k = max(0, min(len(sorted_values) - 1, round(q * (len(sorted_values) - 1))))
    return sorted_values[k]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--limit", type=int, default=0, help="run only the first N pairs (quick check)")
    ap.add_argument("--detector", choices=("onnx", "llm"), default="onnx")
    ap.add_argument("--max-wait", type=float, default=300, help="max seconds to wait per pair on rate limits")
    ap.add_argument("--gap", type=float, default=62,
                    help="seconds between LLM calls (Groq free tier: 8,000 tokens/min, ~4,200 per two-photo call)")
    ap.add_argument("--resume", action="store_true", help="keep finished pairs from results.json, run the rest")
    args = ap.parse_args()
    os.environ["AI_DETECTOR"] = args.detector
    OUT.mkdir(exist_ok=True)
    if eval_key := config.get("GROQ_API_KEY_EVAL"):  # keep the main key's daily quota for the website / demo
        os.environ["GROQ_API_KEY"] = eval_key
        print("using GROQ_API_KEY_EVAL for this run", flush=True)
    finished: dict[str, dict] = {}
    if args.resume and (OUT / "results.json").exists():
        old = json.loads((OUT / "results.json").read_text(encoding="utf-8"))["pairs"]
        finished = {r["pair"]: r for r in old if r["decision"] != "error"}
        print(f"resuming: {len(finished)} pairs already done", flush=True)

    log = _LlmLog()
    logging.getLogger("rivermind_ai.llm").addHandler(log)
    logging.getLogger("rivermind_ai.llm").setLevel(logging.INFO)

    print("loading held-out frames and building pairs ...", flush=True)
    frames = P.load_test_frames(P.ensure_dataset())
    pairs = P.build_pairs(frames, P.scenes(frames))
    if args.limit:
        pairs = pairs[:args.limit]
    # history for the reused_photo cases: the photos of the natural_drop pairs ("submitted earlier")
    natural_prior = list(dict.fromkeys(phash_hex(x) for p in pairs if p.kind == "natural_drop"
                                       for x in (p.before, p.after)))

    rows, latencies = [], []
    last_call, stopped_early = 0.0, False
    for k, pair in enumerate(pairs, 1):
        if pair.pair_id in finished:
            rows.append(finished[pair.pair_id])
            latencies.append(finished[pair.pair_id]["latency_s"])
            continue
        if stopped_early:
            rows.append({"pair": pair.pair_id, "kind": pair.kind, "expected": pair.expected, "decision": "error",
                         "error": "not run: daily LLM limit reached earlier in this run"})
            continue
        if (wait := args.gap - (time.monotonic() - last_call)) > 0:
            time.sleep(wait)
        last_call = time.monotonic()
        prior = natural_prior if pair.kind == "reused_photo" else []
        n_calls = len(log.calls)
        try:
            scores, latency, retries = verify_with_retry(pair, prior, log, args.max_wait)
        except (AIUnavailable, InvalidOutput) as exc:
            rows.append({"pair": pair.pair_id, "kind": pair.kind, "expected": pair.expected, "decision": "error",
                         "error": f"{type(exc).__name__}: {exc}"})
            print(f"[{k}/{len(pairs)}] {pair.pair_id}: ERROR {exc}", flush=True)
            if "daily limit" in str(exc):
                stopped_early = True
                print("daily LLM limit reached: saving partial results; run again later with --resume", flush=True)
            continue
        accepted, failed = decide(scores, prior)
        latencies.append(latency)
        ok_calls = [c for c in log.calls[n_calls:] if c.get("outcome") == "ok"]  # kept per pair, so --resume keeps them
        rows.append({
            "pair": pair.pair_id, "kind": pair.kind, "expected": pair.expected,
            "decision": "accept" if accepted else "reject", "failed_checks": failed,
            "before": pair.before_src, "after": pair.after_src, "simulated": pair.simulated, "edited": pair.edited,
            "inliers": scores.scene_match.inliers, "before_count": scores.count_drop.before_count,
            "after_count": scores.count_drop.after_count, "vote": scores.llm.vote,
            "manipulation": scores.manipulation.flagged, "llm_notes": scores.llm.notes,
            "latency_s": round(latency, 2), "rate_limit_retries": retries, "model_version": scores.model_version,
            "tokens_in": sum(c.get("tokens_in", 0) for c in ok_calls),
            "tokens_out": sum(c.get("tokens_out", 0) for c in ok_calls)})
        print(f"[{k}/{len(pairs)}] {pair.pair_id:16s} expected {pair.expected:6s} -> "
              f"{'accept' if accepted else 'reject'} {failed} vote={scores.llm.vote} inliers="
              f"{scores.scene_match.inliers} counts={scores.count_drop.before_count}->"
              f"{scores.count_drop.after_count} {latency:.1f}s", flush=True)

    done = [r for r in rows if r["decision"] != "error"]
    tp = sum(r["expected"] == "accept" and r["decision"] == "accept" for r in done)
    fn = sum(r["expected"] == "accept" and r["decision"] == "reject" for r in done)
    fp = sum(r["expected"] == "reject" and r["decision"] == "accept" for r in done)
    tn = sum(r["expected"] == "reject" and r["decision"] == "reject" for r in done)
    should_reject, should_accept = fp + tn, tp + fn
    lat = sorted(latencies)
    with_tokens = [r for r in done if r.get("tokens_in")]  # rows from runs before per-pair tokens have none
    summary = {
        "run_at": datetime.now(UTC).isoformat(timespec="seconds"), "simulated": True,
        "pairs": len(rows), "errors": len(rows) - len(done), "incomplete": len(rows) != len(done),
        "should_accept": should_accept,
        "should_reject": should_reject,
        "false_accept_rate": round(fp / should_reject, 3) if should_reject else None,
        "false_reject_rate": round(fn / should_accept, 3) if should_accept else None,
        "confusion": {"accept_accept": tp, "accept_reject": fn, "reject_accept": fp, "reject_reject": tn},
        "by_kind": {kind: dict(Counter(r["decision"] for r in done if r["kind"] == kind))
                    for kind in dict.fromkeys(r["kind"] for r in rows)},
        "failed_check_counts": dict(Counter(c for r in done for c in r["failed_checks"])),
        "injection_llm_fooled": sum(r["kind"] == "injection" and r["vote"] >= vision.MIN_VOTE and not r["manipulation"]
                                    for r in done),
        "latency_s": {"p50": round(statistics.median(lat), 2), "p95": round(pct(lat, 0.95), 2)} if lat else None,
        "llm_tokens_per_call": {"input_mean": round(statistics.mean(r["tokens_in"] for r in with_tokens)),
                                "output_mean": round(statistics.mean(r["tokens_out"] for r in with_tokens)),
                                "pairs_counted": len(with_tokens)}
        if with_tokens else None,
        "model_version": next((r["model_version"] for r in done), None),
    }
    (OUT / "results.json").write_text(json.dumps({"summary": summary, "pairs": rows}, indent=2), encoding="utf-8")
    confusion_png(tp, fn, fp, tn, OUT / "confusion_matrix.png")
    md = [(f"Run {summary['run_at']} · {summary['pairs']} SIMULATED pairs ({summary['errors']} errors) · "
           f"`{summary['model_version']}`"), "",
          "| | decided: accept | decided: reject |", "|---|---|---|",
          f"| should accept ({should_accept}) | {tp} | {fn} (false reject) |",
          f"| should reject ({should_reject}) | **{fp} (false accept)** | {tn} |", "",
          (f"- **False-accept rate: {summary['false_accept_rate']}** ({fp}/{should_reject}) · false-reject rate: "
           f"{summary['false_reject_rate']} ({fn}/{should_accept})"),
          f"- By kind: {summary['by_kind']}",
          f"- Checks that failed (all pairs): {summary['failed_check_counts']}",
          ("- Injection pairs where the LLM was fooled (vote ≥ 0.6 and no manipulation flag): "
           f"{summary['injection_llm_fooled']}"),
          f"- Latency per verification (detector ×2 + ORB + LLM, excluding rate-limit waits): {summary['latency_s']}",
          f"- LLM tokens per call: {summary['llm_tokens_per_call']}"]
    (OUT / "summary.md").write_text("\n".join(md) + "\n", encoding="utf-8")  # "≥" breaks Windows' default cp1252
    print("\n".join(md))


if __name__ == "__main__":
    main()
