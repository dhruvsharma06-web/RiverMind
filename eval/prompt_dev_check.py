"""Compare verifier prompt versions on the DEV set (train + val splits) — never on the test split.

    python eval/prompt_dev_check.py

Dev positives: natural_drop pairs (real, unedited frames where labelled floating waste really dropped).
Dev negatives: the same scenes untouched (no_change) and with the waste digitally erased (edited).
For each prompt version we record the LLM's vote and manipulation flag only (the other checks don't depend on the
prompt). Writes eval/verification/prompt_dev_check.json. Paced for Groq's free tier (one call per ~62 s is safe; 40 s was not).
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pairs as P
from rivermind_ai.errors import AIUnavailable, InvalidOutput
from rivermind_ai.real import llm, vision

GAP_S = 40
N_EACH = 6


def pick_dev_pairs(frames):
    nat = P.natural_drops(frames)
    seen, positives = set(), []
    for i, j in nat:  # one pair per video / photo series, for variety
        seq = P._sequence(frames[i].name)[0]
        if seq not in seen:
            seen.add(seq)
            positives.append((i, j))
    positives = positives[:N_EACH]
    negatives, used_seq = [], set()
    for i, j in sorted(P.sequence_neighbours(frames), key=lambda p: (frames[p[0]].name, frames[p[1]].name)):
        fi, fj = frames[i], frames[j]
        seq = P._sequence(fi.name)[0]
        if (seq in used_seq or not fi.waste_boxes or len(fj.waste_boxes) < len(fi.waste_boxes)
                or fi.phash - fj.phash < 3 or P.inliers(fi.gray, fj.gray) < P.SAME_SCENE_INLIERS):
            continue
        used_seq.add(seq)
        negatives.append((i, j))  # same scene, waste count not lower: no cleanup
        if len(negatives) == N_EACH:
            break
    return positives, negatives


def main() -> None:
    frames = P.load_frames(P.ensure_dataset(), ("train", "val"))
    positives, negatives = pick_dev_pairs(frames)
    cases = ([("natural_drop", "accept", frames[i].jpeg, frames[j].jpeg, frames[i].name, frames[j].name)
              for i, j in positives]
             + [("no_change", "reject", frames[i].jpeg, frames[j].jpeg, frames[i].name, frames[j].name)
                for i, j in negatives]
             + [("edited_cleanup", "reject", frames[i].jpeg, P.remove_waste(frames[j]), frames[i].name,
                 frames[j].name + " (erased)") for i, j in negatives[:3]])
    print(f"dev cases: {len(cases)} ({len(positives)} natural drops, {len(negatives)} no-change, 3 edited)")
    results, last = [], 0.0
    for version, (system, task) in vision.VERIFY_PROMPTS.items():
        for kind, expected, before, after, b_name, a_name in cases:
            wait = GAP_S - (time.monotonic() - last)
            if wait > 0:
                time.sleep(wait)
            last = time.monotonic()
            try:
                v, _ = llm.call_json(system, task, vision._Verdict, images=(before, after),
                                     prompt_version=version, max_tokens=400)
            except (AIUnavailable, InvalidOutput) as exc:
                results.append({"prompt": version, "kind": kind, "error": str(exc)})
                print(version, kind, "ERROR", exc, flush=True)
                continue
            row = {"prompt": version, "kind": kind, "expected": expected, "before": b_name, "after": a_name,
                   "vote": v.vote, "manipulation": v.manipulation_signs, "notes": v.notes,
                   "llm_says_accept": v.vote >= vision.MIN_VOTE and not v.manipulation_signs}
            results.append(row)
            print(f"{version} {kind:15s} vote={v.vote:.2f} manip={v.manipulation_signs!s:5} {b_name}->{a_name}",
                  flush=True)
    summary = {}
    for version in vision.VERIFY_PROMPTS:
        rows = [r for r in results if r["prompt"] == version and "vote" in r]
        summary[version] = {kind: f"{sum(r['llm_says_accept'] for r in rows if r['kind'] == kind)}/"
                                  f"{sum(r['kind'] == kind for r in rows)} accepted by the LLM"
                            for kind in ("natural_drop", "no_change", "edited_cleanup")}
    out = Path(__file__).resolve().parent / "verification"
    out.mkdir(exist_ok=True)
    (out / "prompt_dev_check.json").write_text(json.dumps({"summary": summary, "rows": results}, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
