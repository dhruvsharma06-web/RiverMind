# Model card — RiverMind AI (Wed 11 Nov 2026)

## Summary (6 lines)
- **Purpose:** spot floating waste in river photos, flag water-quality spikes, and score before/after cleanup
  photos so that plain backend code can decide bounties and payouts. The AI never decides money.
- **Model / version:** waste detector `yolo11n-rivermind-v2` (YOLO11n fine-tuned, ONNX 10.8 MB, CPU); cleanup
  verifier `yolo11n-rivermind-v2+orb+groq:qwen/qwen3.8-27b` (detector counts + ORB scene match + one vision-LLM
  call); sensor anomaly `anomaly-v1` (limits + robust z-score + IsolationForest).
- **Data:** public, pre-labelled, CC BY 4.0 — Mendeley turbid-river floating waste (1,577 photos) and Roboflow
  *River Trash final* (1,753 photos). No Yamuna photos, no manual labels. Credits: `ATTRIBUTION.md`.
- **Metric:** held-out test splits — detector waste mAP50 **0.364** on turbid rivers (zero-shot baseline 0.033),
  **0.789** on River Trash; count error 1.98 items/image. Verification on 51 simulated held-out pairs:
  **false-accept rate 3/44 (6.8%)** — all 3 are digitally erased photos; 0/32 for every other kind of fake.
- **Limits:** small, distant items in murky water are often missed; bottle/bag learned only from close-up photos;
  never tested on Yamuna photos or on real cleanups by people (the false-reject rate for real cleanups is
  unmeasured); a well-photoshopped "after" photo can pass (3 of 12); Groq's free tier allows ~50–100 verifications
  per day per account.
- **Fallback:** any LLM failure, timeout, rate limit or invalid output → `AIUnavailable` / `InvalidOutput` → the API
  answers 503 `AI_UNAVAILABLE` and the claim stays open for a resubmit. No guessed vote, ever. Mock mode is
  labelled `mock-1`.

## Waste detector (`analyze_media`)
| | |
|---|---|
| Architecture | YOLO11n (Ultralytics 8.4.43 for training only), 2.6 M parameters, input 960×960, output [1, 8, 18900] |
| Classes | bottle, bag, other, vegetation (vegetation dropped from counts and boxes) |
| Training | COCO-pretrained YOLO11n; 2,334 train / 664 val images from both datasets; stopped after epoch 52/60 |
| Server inference | our numpy/onnxruntime code (letterbox, NMS) — identical boxes to Ultralytics on 17/17 test boxes |
| Thresholds | count at confidence ≥ 0.25 (validation split); `waste_score` maps "≥ 1 item at 0.25" to the event line 0.5 |
| Event behaviour (validation) | opens an event for 85.3% of photos with waste and 20.5% of photos without |
| Speed | ~150 ms per photo warm, ~470 ms first call (dev laptop CPU) |
| Licence | Ultralytics YOLO weights: AGPL-3.0; repo: MIT |

## Cleanup verification (`verify_cleanup`)
Per-check results with the CONTRACT thresholds; the backend adds geo, time and duplicate checks and decides.
- **Scene match:** ORB + RANSAC inliers ≥ 25. **Count drop:** detector counts, after ≤ 40% of before.
- **LLM vote + manipulation:** one Groq call with both photos (≤ 1024 px, EXIF stripped), temperature 0, strict
  JSON, one retry, 15 s deadline. Text in photos is treated as scene content; text asking for approval or payment
  counts as manipulation.
- **Eval (51 simulated pairs from the held-out test split, Wed 11 Nov; `eval/RESULTS.md`):**

  | Kind (expected) | n | Decided correctly |
  |---|---|---|
  | no change (reject) | 12 | 12 |
  | "APPROVE PAYMENT" text on the photo (reject) | 6 | 6 — LLM never fooled |
  | wrong place (reject) | 6 | 6 |
  | same photo twice / reused earlier photo (reject) | 8 | 8 |
  | trash digitally erased from the after photo (reject) | 12 | **9 — 3 false accepts** |
  | "natural drop" (accept) | 7 | 0 — but none is a real cleanup (see failure 3) |

  False-accept rate 3/44 = 6.8% (95% interval 2.3–18.2%). Latency p50 1.49 s, p95 2.58 s; ~2,340 input tokens
  per call.
- **End-to-end through the real backend** (`USE_MOCK_AI=false`): with the LLM key broken, `/proof` returned 503
  and the claim stayed open; a reused photo was rejected as a duplicate; an "APPROVE PAYMENT" photo was rejected
  (vote 0.0, manipulation flagged). The two "natural cleanup" pairs were rejected — correctly, see failure 3.
- **Prompt revision (v1 → v2):** v2 tells the model that only man-made litter counts and plants are not waste
  (the contract's rule). Chosen on the dev set (train + val frames), never on the test split: natural drops
  accepted 0/5 → 1/6; an erased "cleanup" that fooled v1 (vote 0.9) was flagged by v2. Thin evidence — the
  comparison was cut short by Groq's daily token limit.

## Failure examples (from the held-out eval)
1. **Photoshopped cleanup accepted — `edited_cleanup-06` (FOTO_0201 → FOTO_0203, trash erased).** Every check
   passed: ORB 30 inliers (≥ 25), detector 15 → 3 items (≤ 40%), LLM vote 1.0 — "The large cluster of man-made
   waste (red packaging, styrofoam, bottles) … is completely removed" — no edit flagged. Money would be paid. Same
   pattern in `edited_cleanup-03` (vote 1.0) and `-05` (vote 0.9). Mitigation: in-app camera capture only, and
   council approval for payouts above $20 (already in the contract).
2. **Detector and LLM disagree on what "clean" means — `edited_cleanup-01` / `-08`.** The LLM was fooled (vote 1.0)
   but the detector still counted waste after the erasure (2 → 1, 2 → 3), so the count check rejected them. The
   independent checks are what keep the false-accept rate down; no single model is trusted alone.
3. **The eval's own "should accept" pairs are not cleanups — `natural_drop-01` (FOTO_0219 → FOTO_0225).** The
   detector counted 1 → 0 and ORB matched (148), but the LLM voted 0.1: "The same man-made litter (bottles,
   wrappers) is visible in both photos". Looking at the frames, it is right: the camera panned away from the
   labelled waste and unlabelled litter is still in view. The other natural pairs end on a frame that still holds
   2 labelled items. So the false-reject rate for real cleanups remains unmeasured.

## Sensor anomaly details
Three checks (absolute limits that fire on a new crossing, robust z-score > 3.5 over the last 2 hours,
IsolationForest on z-scores trained on simulated normal data). Severity = min(statistical significance, physical
size). Unit-tested with injected spikes only; not evaluated on real sensor data. See `README.md` §3.4.

## Safety
- Images, worker notes and any text inside images are data, never instructions.
- Every LLM output is schema-validated (`extra="forbid"`); invalid → one retry → error. Bounty amounts must lie
  inside a band computed by code (enforced by the schema), and the backend re-checks budget anyway.
- The AI returns per-check scores only; geo, time, duplicate and the overall pass/fail are computed by the backend.
- Logs carry model, prompt version, image hashes, latency and token counts — never keys, image bytes or prompts.
