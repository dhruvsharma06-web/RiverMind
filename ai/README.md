# `rivermind_ai` — RiverMind's AI core (P2)

The river's "senses and judgement": it looks at photos for floating waste, watches sensor readings for pollution
spikes, drafts cleanup bounties, scores before/after cleanup photos and writes the river's diary.

**The one rule:** the AI proposes and scores; plain backend code decides every amount and every payment
(CONTRACT.md "Verification policy", "Budget rules"). Nothing in this package can move money.

Related docs: [`MODEL_CARD.md`](MODEL_CARD.md) (model card) · [`DECISIONS.md`](DECISIONS.md) (why we chose what we
chose) · [`ATTRIBUTION.md`](ATTRIBUTION.md) (datasets, licences) · [`../eval/README.md`](../eval/README.md)
(how we evaluate) · [`../eval/RESULTS.md`](../eval/RESULTS.md) (measured numbers).

---

## 1. Status (updated Wed 11 Nov 2026, IST)

Status words as in the team prompts: *implemented* → *integrated* (merged + called by the backend) → *verified*.

| Function (`RiverAI`) | Mock (`USE_MOCK_AI=true`) | Real (`USE_MOCK_AI=false`) |
|---|---|---|
| `analyze_media` | ✅ texture heuristic, labelled `mock-1` | ✅ **implemented + tested**: YOLO11n v2 ONNX detector (boxes, counts), foam colour rule, calibrated `waste_score`; `AI_DETECTOR=llm` fallback (counts only) |
| `detect_sensor_anomaly` | ✅ turbidity > 2× median | ✅ **implemented + tested**: limits + robust z-score + IsolationForest |
| `propose_bounty` | ✅ clamp(500 × severity) | ✅ **implemented + tested**: code sets the amount band, LLM writes text and picks inside it; rule-based fallback |
| `verify_cleanup` | ✅ always-passing scores + real phashes | ✅ **implemented + tested**: ORB scene match + detector count drop + one LLM call (vote + manipulation); no stand-in vote on failure |
| `phash` | ✅ real | ✅ real (same function) |
| `write_diary` | ✅ template from given numbers | ✅ **implemented + tested**: LLM text, every number checked against the inputs, template fallback |
| `draft_invoice` | ✅ min(max, $100) | ✅ **implemented + tested**: deterministic, capped, never uses the email |

PR #4 (package, mock, sensor anomaly, detector, docs) is merged into `main`. The real vision/agent code and the LLM
client are on branch `vyom`, not pushed yet. With `rivermind_ai` installed the backend suite passes (230 passed).
Verification eval (51 simulated held-out pairs): false-accept rate 3/44 (6.8%), all from digitally erased photos;
details and caveats in `eval/RESULTS.md`.

## 2. How the backend uses this package

```
backend/app/adapters/ai_adapter.py ──► rivermind_ai.factory.get_river_ai(use_mock)
                                         ├── mock.MockRiverAI        (base deps only)
                                         └── real.RealRiverAI        (needs the [real] extra)
```

- **Contract:** CONTRACT.md "AI adapter". Every input/output model is in `rivermind_ai/schemas.py` (pydantic v2,
  `extra="forbid"`, ranges enforced). The backend re-validates `Detection` with its own schema.
- **Errors:** only `AIUnavailable` (provider down / timeout / not built / not configured) and `InvalidOutput`
  (schema still invalid after one retry). The backend maps both to HTTP 503 `AI_UNAVAILABLE`. We never return
  invented results instead of an error.
- **Backend limits around us:** 25 s timeout per call, 8 worker threads, 2,000 paid AI calls per process per day
  (`phash` is free).
- **Rules the backend relies on** (confirmed by P3, Tue 10 Nov):
  - Import paths must stay exactly `from rivermind_ai import schemas`, `from rivermind_ai.errors import
    AIUnavailable, InvalidOutput`, `from rivermind_ai.factory import get_river_ai`; otherwise the backend silently
    keeps its own placeholder mock.
  - `get_river_ai` is called once and cached; up to 8 calls run at the same time on that one object, so every
    method must be thread-safe.
  - No heavy work at import time: load the ONNX model and LLM clients lazily.
  - Own LLM timeout, including the one retry, under ~20 s so we answer before the backend's 25 s.
  - Never log keys, image bytes, or prompts that contain emails (`draft_invoice` receives the sponsor's email).
  - `model_version` on every output; the mock's contains `mock`. `phash` is local, free, exactly 16 hex chars.
  - The backend re-checks every amount (min/max, budget, daily cap) and clamps `radius_m` to 25–1000 m;
    `numbers_validated=false` makes it discard a diary entry.
  - Render free tier = 512 MB RAM for everything: P3 asks for the **peak memory of one `analyze_media` + one
    `verify_cleanup`**; above ~350 MB we need a lighter path. Also report the cost per call.
- `get_river_ai` never raises while building the object (the backend builds it outside its error handling);
  failures surface per call.
- `ai/` imports nothing from `backend/`.

Layout:

```
ai/
├── pyproject.toml            package "rivermind-ai"; extras [real], [dev]
├── rivermind_ai/
│   ├── schemas.py            all contract models
│   ├── interface.py          RiverAI protocol
│   ├── errors.py             AIUnavailable, InvalidOutput
│   ├── factory.py            get_river_ai(use_mock)
│   ├── config.py             env settings (+ ../.env, .env like the backend)
│   ├── imaging.py            decode, pHash, foam ratio, texture
│   ├── mock.py               deterministic mock
│   ├── real/__init__.py      RealRiverAI: routes each method to the modules below
│   ├── real/detector.py      ONNX detector: letterbox, NMS, box mapping; loaded once, shared by threads
│   ├── real/vision.py        analyze_media, verify_cleanup (ORB, count drop, LLM vote + manipulation)
│   ├── real/agent.py         propose_bounty, write_diary, draft_invoice
│   ├── real/llm.py           vision-LLM client (Groq): strict JSON, one retry, deadline, honest errors
│   ├── real/anomaly.py       sensor anomaly detection
│   └── models/               shipped ONNX detector (≤ 25 MB, committed)
├── tests/                    pytest: contract, mock, anomaly, llm, real (+ assets/: 3 held-out photos)
└── tools/                    laptop/Colab only, not packaged: training notebooks
eval/
├── pairs.py                  builds SIMULATED before/after pairs from held-out frames
├── run_verification_eval.py  F6 eval, one command → eval/verification/
└── run_backend_e2e.py        full journey through the real backend → eval/e2e/
```

## 3. Algorithms

### 3.1 Waste detector and `analyze_media` (implemented, `real/detector.py`, `real/vision.py`)
- **Model:** YOLO11n (2.6 M parameters) fine-tuned from COCO weights, image size 960, exported to ONNX (opset 17,
  10.8 MB), run with onnxruntime on CPU. No PyTorch on the server.
- **Shipped:** `models/yolo11n-rivermind-v2.onnx`, classes `bottle`, `bag`, `other`, `vegetation`.
  Vegetation is detected but, per the contract, dropped from counts and boxes.
- **Data (pre-labelled, public, CC BY 4.0 — no manual labelling):**
  1. Mendeley *Floating Waste and Aquatic Vegetation from Turbid Rivers* v2 — 1,577 turbid-river photos,
     labels `floating_waste` → our `other`, `river_vegetation` → `vegetation`. 4 photos with EXIF rotation skipped.
  2. Roboflow Universe *River Trash final* v2 — 1,753 photos with bottle/bag/other trash labels
     (mapping in `ATTRIBUTION.md`; oil-spill boxes dropped).
- **How v2 was trained** (`tools/train_detector_v2.ipynb`): (1) a *teacher* YOLO11n on River Trash; (2) the
  teacher tries to relabel Mendeley "floating waste" boxes as bottle/bag (IoU ≥ 0.5, confidence ≥ 0.35) — it
  changed only 1 of 3,066 boxes; (3) a *student* YOLO11n on both datasets (2,334 train images), stopped manually
  after epoch 52/60.
- **v1** (`tools/train_detector.ipynb`): Mendeley only, classes `other`/`vegetation`. Kept for comparison, not
  shipped.
- **Results:** see `eval/RESULTS.md`. Headline: on the turbid-river test split v2 scores waste mAP50 0.364
  (v1 0.390, zero-shot YOLO-World 0.033); on the River Trash test split 0.789 (v1 0.017).
- **Inference (our code, no Ultralytics on the server):** letterbox the RGB photo to 960×960 (grey 114 padding,
  as in training) → onnxruntime → keep anchors whose best class score ≥ 0.25 → per-class non-max suppression
  (IoU 0.7) → map boxes back to the photo, normalised 0–1. Checked against Ultralytics' own predictor on 12 held-out
  photos: **17 of 17 boxes identical** (same class, IoU > 0.9, confidence within 0.03).
- **Runtime:** session created on first use (never at import), shared by all threads; 2 intra-op threads and no
  memory arena to keep memory down. ~150 ms per photo warm, ~470 ms on the first call (dev laptop CPU).
- **Counts and boxes:** bottle/bag/other boxes at confidence ≥ 0.25; vegetation is dropped. The 0.25 threshold was
  chosen on the **validation** split (664 images): count error 1.03 items/image vs 1.00 at 0.20 (a tie); 0.25 adds
  fewer phantom items to "after" photos.
- **`waste_score` (calibrated, validation split):** raw = 1 − ∏(1 − conf) over waste boxes (chance that at least
  one is real), then a piecewise-linear map putting raw = 0.25 (one item at the counting threshold) at the backend's
  event line 0.5; more and surer items push it toward 1 (higher severity). On validation that line flags **85.3%**
  of photos with waste and **20.5%** of photos without; a plain raw ≥ 0.5 cut would flag 71.9% / 17.8%.
  `confidence` = |score − 0.5| × 2 (how sure the event decision is). Foam does **not** enter the score (its
  false-alarm rate is unmeasured); it is reported in `counts.foam` and the summary.
- **`AI_DETECTOR=llm`** (fallback if a small server can't hold the detector): one LLM call returns counts and a
  summary, no boxes; `model_version` = `llm-detect+groq:<model>`. Score: 0 items → 0, any item → ≥ 0.5.

### 3.2 Foam ratio (implemented, `imaging.foam_ratio`)
Share of pixels in the lower half of the photo (where the water usually is) with HSV saturation < 40 and value >
200 (0–255 scales), computed on a ≤ 256 px copy. `counts.foam = 1` when the ratio > 0.05 (contract rule).

### 3.3 Perceptual hash (implemented, `imaging.phash`)
64-bit DCT pHash (`imagehash.phash`) as 16 hex characters. The **backend** uses it for the duplicate check:
Hamming(before, after) ≥ 3 and Hamming(any proof photo, every earlier proof photo) ≥ 6, else "duplicate photo".

### 3.4 Sensor anomaly detection (implemented, `real/anomaly.py`)
Input: the new reading + the device's previous readings (the backend sends the last 30, i.e. ~5 min at one per
10 s). Only readings from the last 2 hours are used.

1. **Absolute limits** — pH outside 6.5–8.5; turbidity above `ANOMALY_MAX_TURBIDITY_NTU` (default 100 NTU, a demo
   setting, not a regulatory limit). Fires only when the reading **newly** crosses the limit (the recent median
   was inside it), so a river that stays outside a limit doesn't raise an event every 10 seconds.
2. **Robust z-score** per sensor (needs ≥ 8 recent readings): z = 0.6745 × (x − median) / MAD, flagged at
   |z| > 3.5. Turbidity and TDS count only rises; pH and temperature count both directions. The MAD has a
   per-sensor floor (turbidity 0.5 NTU, pH 0.02, TDS 2 ppm, temperature 0.1 °C) so a perfectly flat history
   doesn't divide by ~0.
3. **IsolationForest** (contamination 0.02, 100 trees, 2,000 simulated samples, seed 0) on the 8 robust z-scores of the values and of
   their latest changes; trained once on simulated standard-normal z-scores. "Normal" therefore means
   "unremarkable for this device", not an assumed Yamuna level. Consulted only when no single rule fired; it
   catches several sensors shifting together.

**Score → severity** (backend: severity = ceil(5 × score), which drives the bounty amount): for a z-score breach,
min(statistical significance, physical size), at least 0.2. Significance = log scale from 0.35 at |z| = 3.5 to 1.0
at |z| ≥ 30. Physical size = turbidity rise relative to the median (3× = 1.0), TDS rise (2× = 1.0), pH change
(1.5 units = 1.0), temperature change (6 °C = 1.0). A new limit breach scores 0.6, the forest alone 0.4.
These scales are our heuristics, not calibrated on real data. Example on a 38 NTU baseline: 50 NTU → severity 1,
60 → 2, 85 → 4, ≥ 110 → 5.

Every result carries `method` (e.g. `anomaly-v1:abs_limit+robust_z`) and a plain-English `reason`.

### 3.5 Mock (`mock.py`, `model_version="mock-1"`)
Deterministic, no network. `waste_score` = clamp(texture / 24) where texture = mean absolute brightness difference
between neighbouring pixels on a ≤ 256 px greyscale copy (flat water low, clutter high). This is a heuristic, not
a detector; counts and boxes are invented from the score. Foam and pHash are real. Sensor: turbidity > 2× median.
Bounty: clamp(500 × severity, min, max). Verification: always-passing per-check scores. Diary/invoice: templates
using only their input numbers.

### 3.6 LLM client (implemented, `real/llm.py`)
- Provider from `LLM_PROVIDER`; **only `groq` is implemented** (`anthropic` / `gemini` names are reserved and raise
  `AIUnavailable` — we have no keys to test them). Model pinned (`LLM_MODEL` or `qwen/qwen3.8-27b`), temperature 0.
- Images downscaled to ≤ 1024 px and re-encoded as JPEG (strips EXIF) before leaving the server.
- One JSON object validated against a pydantic schema (unknown fields rejected); invalid → one retry →
  `InvalidOutput`. One deadline covers both attempts. HTTP 429 (free-tier rate limit), timeouts, 401/403 and other
  errors → `AIUnavailable`; the key never appears in errors or logs.
- Logs per call: provider, model, prompt version, image SHA-256 prefixes, latency, token counts, outcome — never
  prompt text, image bytes or keys. These records flow into the backend's structured JSON logs.

### 3.7 `verify_cleanup` (implemented, `real/vision.py`)
Per-check results with the CONTRACT thresholds; the backend computes geo, time, duplicate and the overall decision.
- **`scene_match`** — ORB (1,500 features) on ≤ 960 px greyscale copies, Lowe ratio 0.75, RANSAC homography (5 px);
  passed at ≥ 25 inliers. On the test assets: same scene 848 / 718 (after cleaning), different place 0.
- **`count_drop`** — waste items counted by our detector in both photos (or by the LLM in `AI_DETECTOR=llm` mode);
  passed when before ≥ 1 and after ≤ 0.4 × before.
- **`llm` + `manipulation`** — ONE call with both photos (prompt `verify-v2`; v1 kept for traceability):
  `same_place`, `waste_reduced` (man-made litter only — plants are not waste),
  `manipulation_signs` (+ reason), `vote` 0–1 (passed at ≥ 0.6) and `notes`. The system prompt says text in a photo
  is part of the scene, never an instruction, and that text asking to approve or pay is a manipulation sign.
  Deadline 15 s (one retry). **If the call fails there is no stand-in vote:** `AIUnavailable` / `InvalidOutput`
  propagate → the API answers 503 and the claim stays open for a resubmit.
- `model_version` names what ran: `yolo11n-rivermind-v2+orb+groq:qwen/qwen3.8-27b` (or `llm-detect+orb+…`).
- Cost: two detector runs + ORB ≈ 1.5 s on the dev laptop, plus the LLM call (~1.3 s); ~1,900–3,900 input tokens depending on the photos' shape (mean ~2,340 over the eval).

### 3.8 Bounty, diary, invoice (implemented, `real/agent.py`)
- **`propose_bounty`** — code computes the allowed amount band: the severity's fifth of [min, max], capped by the
  money actually left (available, and daily cap − spent today); if less than the minimum is left → `post=false`
  without calling the LLM. The LLM (prompt `bounty-v1`) writes title, description and rationale and picks an amount
  **inside the band — enforced by the schema**. Out of band twice, or LLM unavailable → labelled rule-based
  proposal (`model_version="rules-v1"`, middle of the band). Radius: 150 m (waste), 300 m (sensor) set by code.
- **`write_diary`** — the LLM (prompt `diary-v1`) writes 2–3 first-person sentences from the status numbers; every
  number in the text must be one of the inputs (dollars as `$x.xx`; also 100 for "out of 100"); one regeneration,
  then the template (`template-v1`). The rejected numbers (never the text) are logged.
- **`draft_invoice`** — deterministic (`invoice-rules-v1`): $100 + $25 per open bounty, capped at `max_cents`; the
  sponsor email is neither used nor logged.

## 4. LLM provider
- **Groq**, model `qwen/qwen3.8-27b` (accepts images, JSON output). S0.1 check: 1 call, 0.80 s, 823 input /
  37 output tokens, free tier. (The key the team had called "Grok" turned out to be a Groq key — see DECISIONS.)
- Backups behind the same setting: Claude API (`anthropic`) and Gemini — not tested yet.

## 5. Configuration (environment variables)
Values live in the repo-root `.env` (git-ignored); names in `.env.example`. Real environment variables win; for
local runs the package also reads `../.env` and `.env` relative to the working directory (same as the backend).

| Name | Used by | Meaning |
|---|---|---|
| `USE_MOCK_AI` | backend | `true` → mock, `false` → real adapter |
| `LLM_PROVIDER` | real | `groq` (default in `.env.example`), `anthropic`, `gemini` |
| `LLM_MODEL` | real | optional model override |
| `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | real | provider keys (never logged) |
| `AI_DETECTOR` | real | `onnx` (our detector, default) or `llm` (vision-LLM counts, no boxes) |
| `DETECTOR_MODEL_PATH` | real | defaults to the shipped ONNX |
| `ANOMALY_MAX_TURBIDITY_NTU` | real | turbidity limit, default 100 |
| `ROBOFLOW_API_KEY` | laptop tools only | dataset download; the app never uses it |

## 6. Install, test, train

```bash
# from the repo root, in a project venv (keeps opencv builds from clashing with a global Python)
python -m venv .venv
.venv/Scripts/python -m pip install -e "ai[real,dev]"     # Windows; on macOS/Linux: .venv/bin/python
cd ai && ../.venv/Scripts/python -m pytest -q              # 72 passed, 4 skipped (3 wait for fixture photos, 1 live)
../.venv/Scripts/ruff check .
```

Tests never see the developer's `.env` or real keys (an autouse fixture hides them); the LLM is a scripted fake.
The one live test runs only with `RIVERMIND_LIVE_LLM=1`. Real-path tests use 3 small held-out photos in
`tests/assets/` (CC BY, credited).

Evaluations (need the `[real]` extra, `GROQ_API_KEY`, and the Mendeley zip — downloaded and checksum-verified
automatically if missing):

```bash
.venv/Scripts/python eval/run_verification_eval.py   # F6: false-accept / false-reject on simulated pairs
.venv/Scripts/python eval/run_backend_e2e.py         # whole journey through the real backend, USE_MOCK_AI=false
```
Both space their LLM calls ~62 s apart for Groq's free tier (8,000 tokens/minute and 1,000 requests/day; a two-photo
call is budgeted at ~4,200 tokens, so about one verification per minute).

Training runs on Google Colab (free T4 GPU): upload `tools/train_detector.ipynb` (v1) or
`tools/train_detector_v2.ipynb` (v2), Runtime → T4 GPU → Run all, choose **Select all** at the Drive prompt.
Checkpoints go to `MyDrive/rivermind/`, so Run all again resumes after a disconnect. v2 needs
`river-trash-final-v2-yolov11.zip` uploaded to `MyDrive/rivermind/`. Lessons learned: the free GPU quota runs out
after a few hours (we finished v2 on a second account); predicting on a list of ~1,400 photos at once ran out of
RAM (fixed: one photo at a time, no RAM cache for the student).

Raw datasets and weights stay out of git (`data/`, `*.pt`); only the shipped ONNX and the metrics files are
committed.

## 7. Remaining work (P2) — tracked here

Stage windows (IST): S2 ends Wed 11 Nov 11:00 (Sync 2) · S3 ends Wed 23:00 · S4 Thu 08:00–15:00 (freeze) ·
S5 Thu 15:00–22:00 (submit).

**Final team plan (agreed Wed 11 Nov).** RiverMind is now a standalone website: no live demo, no tank, no ESP32
(sensor readings come from the labelled simulator); only a screen-recorded video remains. No stand-in vote: if the
LLM fails → `AIUnavailable` → 503, the claim stays open for a resubmit. **Done means steps 1–5 work and
`make test` is green.** In order:

1. [x] Groq model takes two images in one request (`qwen/qwen3.8-27b`, pinned, temperature 0) — see `eval/RESULTS.md`
2. [x] Real `verify_cleanup`: pHash duplicate (backend) · ORB scene match ≥ 25 inliers · detector count drop
       (before ≥ 1, after ≤ 0.4 × before) · one LLM call → vote (≥ 0.6) + manipulation flag (flagged = fail).
       Images downscaled to ~1024 px, EXIF stripped; text in photos is data. LLM: one retry, 15 s max, then
       `AIUnavailable`; whole call inside the backend's 25 s. We fill per-check `passed`; the backend decides.
       `model_version` names what ran, e.g. `yolo11n-rivermind-v2+orb+groq:qwen/qwen3.8-27b`.
3. [x] Real `analyze_media`: v2 ONNX loaded once and shared; counts + normalised boxes; foam stays the colour rule
4. [~] End to end with the backend (`USE_MOCK_AI=false`, pairs from held-out frames): a cleanup passes, a reused
       photo is rejected, an "APPROVE PAYMENT" photo is rejected, an LLM failure → 503 with the claim still open
5. [x] `python eval/run_verification_eval.py`: simulated pairs from held-out frames (labelled) → false-accept and
       false-reject rates with set size, per-check failure reasons, p50/p95 latency in `eval/RESULTS.md`
6. [x] Keep simple: `propose_bounty` (code computes the range, LLM picks inside it, rule-based fallback);
       `write_diary` (LLM + number check, template fallback); `draft_invoice` (deterministic, ≤ `max_cents`)
7. [~] If time: `MODEL_CARD.md` with eval numbers + 2–3 failure examples; memory check on Render (> ~350 MB →
       `AI_DETECTOR=llm`, stated in `model_version`)

**Status of 4, 5, 7 (Wed 11 Nov, 23:30 IST):**
- **Step 4:** ran live twice (prompts v1 and v2), 3 of 5 checks pass each time: outage → 503 with the claim kept
  open, reused photo rejected, "APPROVE PAYMENT" rejected. "A cleanup passes" fails because the dataset has no real
  cleanup: both candidate pairs still show litter in the after photo (checked by eye), and the LLM says so. Needs
  one real before/after pair, which is also what the demo video needs.
- **Step 5:** done — 51/51 pairs, false-accept rate 3/44 (6.8%), all from digitally erased photos; 0/32 for every
  other fake; p50 1.49 s, p95 2.58 s. The false-reject rate for real cleanups is not measurable from public data
  (`ai/DECISIONS.md` AI-21).
- **Step 7:** model card has the eval numbers and 3 failure examples; memory measured on Windows only — the Render
  check is for whoever deploys.

**Skipped (team decision):** `analyze_clip`, foam detection with the detector, boxes in verification results,
demo photo pairs.

**Constraint found in step 1:** Groq's free tier allows 8,000 tokens per minute and 1,000 requests per day (~1 verification per
minute), so the eval runner paces itself and backs off on HTTP 429. It also caps tokens per day at 200,000 per
account, refilling continuously (~8,300 tokens/hour ≈ 2 photo checks/hour once empty) — keep the demo's key away
from tests.

**Done**
- [x] Package, schemas, mock, contract tests (S0.2, S0.3, S1.1)
- [x] Real LLM access check (S0.1, Groq) and two-image check (step 1)
- [x] Evaluation plan (S0.5) — `eval/README.md`; AI docs: this README, `MODEL_CARD.md`, `DECISIONS.md`
- [x] Zero-shot baseline (S0.4) — measured on the test split instead of 10 laptop images
- [x] Datasets + licences (S0.6), detector trained v1 + v2, v2 shipped
- [x] Sensor anomaly real (S1.2)
- [x] Backend tests patched to work with the real package
