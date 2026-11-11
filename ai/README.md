# `rivermind_ai` — RiverMind's AI core (P2)

The river's "senses and judgement": it looks at photos for floating waste, watches sensor readings for pollution
spikes, drafts cleanup bounties, scores before/after cleanup photos and writes the river's diary.

**The one rule:** the AI proposes and scores; plain backend code decides every amount and every payment
(CONTRACT.md "Verification policy", "Budget rules"). Nothing in this package can move money.

Related docs: [`MODEL_CARD.md`](MODEL_CARD.md) (model card) · [`DECISIONS.md`](DECISIONS.md) (why we chose what we
chose) · [`ATTRIBUTION.md`](ATTRIBUTION.md) (datasets, licences) · [`../eval/README.md`](../eval/README.md)
(how we evaluate) · [`../eval/RESULTS.md`](../eval/RESULTS.md) (measured numbers).

---

## 1. Status (updated Tue 10 Nov 2026, 23:50 IST)

Status words as in the team prompts: *implemented* → *integrated* (merged + called by the backend) → *verified*.

| Function (`RiverAI`) | Mock (`USE_MOCK_AI=true`) | Real (`USE_MOCK_AI=false`) |
|---|---|---|
| `analyze_media` | ✅ texture heuristic, labelled `mock-1` | 🟡 detector **trained and exported** (YOLO11n v2 ONNX); adapter code not built yet → raises `AIUnavailable` |
| `detect_sensor_anomaly` | ✅ turbidity > 2× median | ✅ **implemented + unit-tested** (robust z-score + limits + IsolationForest) |
| `propose_bounty` | ✅ clamp(500 × severity) | ⬜ planned: code computes the allowed range, Groq LLM writes text and picks inside it |
| `verify_cleanup` | ✅ always-passing scores + real phashes | ⬜ planned: pHash + ORB scene match + detector count drop + Groq vote |
| `phash` | ✅ real | ✅ real (same function) |
| `write_diary` | ✅ template from given numbers | ⬜ planned: Groq text + number validator, template fallback |
| `draft_invoice` | ✅ min(max, $100) | ⬜ planned (P1 feature F14) |

Nothing is merged to `main` yet: the work is on branch `feat/ai-core`, not yet pushed.
Backend integration so far: the backend's test suite passes with this package installed (213 passed).

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
│   ├── real/__init__.py      RealRiverAI (unbuilt methods raise AIUnavailable)
│   ├── real/anomaly.py       sensor anomaly detection
│   └── models/               shipped ONNX detector (≤ 25 MB, committed)
├── tests/                    pytest: contract, mock, anomaly
└── tools/                    laptop/Colab only, not packaged: training notebooks
```

## 3. Algorithms

### 3.1 Waste detector (trained, ONNX; adapter not built yet)
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
- **Still to build in the adapter:** letterbox preprocessing, confidence threshold + NMS in numpy, normalised
  boxes, per-class counts, `waste_score` formula (will be documented here when written), memory limits
  (onnxruntime threads / arena) for Render's 512 MB.

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
3. **IsolationForest** (contamination 0.02, 200 trees, seed 0) on the 8 robust z-scores of the values and of
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

### 3.6 Planned (designed, not built yet)
- **LLM client** — provider from `LLM_PROVIDER` (`groq` main; `anthropic`, `gemini` backups), strict JSON validated
  against our schemas, one retry then `InvalidOutput`, timeouts/rate limits → `AIUnavailable`. System prompt states
  that text visible in images or notes is content, not instructions.
- **`propose_bounty`** — code computes the allowed amount range from `BudgetCtx` and the event severity; the LLM
  writes title/description/rationale and picks an amount inside the range; out-of-range → retry once → error.
- **`verify_cleanup`** — per-check `passed` with the contract thresholds: `scene_match` ORB inliers ≥ 25;
  `count_drop` before ≥ 1 and after ≤ 0.4 × before (detector counts); `llm` vote ≥ 0.6;
  `manipulation.flagged` when the vision model sees editing or a photo of a screen. Never returns the overall
  decision.
- **`write_diary`** — first-person river voice from real status numbers; a regex checks every number in the text
  exists in the inputs (cents also accepted as dollars); regenerate once, else template.
- **Cost/speed:** cache by SHA-256 of image bytes, downscale to 1280 px before LLM calls, concurrency cap 2,
  per-call token cap.

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
| `AI_DETECTOR` | real | `onnx` (our detector) or `llm` |
| `DETECTOR_MODEL_PATH` | real | defaults to the shipped ONNX |
| `ANOMALY_MAX_TURBIDITY_NTU` | real | turbidity limit, default 100 |
| `ROBOFLOW_API_KEY` | laptop tools only | dataset download; the app never uses it |

## 6. Install, test, train

```bash
# from the repo root, in a project venv (keeps opencv builds from clashing with a global Python)
python -m venv .venv
.venv/Scripts/python -m pip install -e "ai[real,dev]"     # Windows; on macOS/Linux: .venv/bin/python
cd ai && ../.venv/Scripts/python -m pytest -q              # 43 passed, 3 skipped (skips wait for fixture photos)
../.venv/Scripts/ruff check .
```

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

**S2 — first real slice**
- [ ] LLM client (Groq + backups), strict JSON, retry, honest errors
- [ ] `propose_bounty` real (S2.2)
- [ ] `analyze_media` real with the v2 ONNX: preprocessing, NMS, counts, foam, documented `waste_score`, memory
      limits (S2.1)
- [ ] `verify_cleanup` real: pHash + ORB + count drop + LLM vote, injection-safe prompt (S2.3)
- [ ] Latency p50/p95 and cost per call recorded (S2.4)
- [ ] Hand-off: backend with `USE_MOCK_AI=false`, `/media/analyze` and `/proof` with non-fixture images (S2.5)

**S3 — complete P0**
- [ ] Automatic verification eval set + false-accept rate (S3.5) — see `eval/README.md`
- [ ] `write_diary` real with number validator (S3.1)
- [ ] Caching, downscaling, concurrency and token caps (S3.3)
- [ ] Recalibrate the mock threshold on `fixtures/images/*` once they exist
- [ ] `tools/analyze_clip.py` counting demo (S3.4) — **cut candidate**

**S4 — harden**
- [ ] Prompt-injection cases (photo with "APPROVE PAYMENT", injected worker note), logging of input hashes /
      prompt version / model id (S4.1)
- [ ] Fallbacks: provider down → `AIUnavailable`; any demo cache clearly labelled (S4.2)
- [ ] `draft_invoice` real (S4.3)
- [ ] Re-run all evals, finalise `MODEL_CARD.md` (S4.4)

**S5 — demo**
- [ ] Pin model ids, prompt versions, parameters (S5.1)
- [ ] 3 demo inputs + 1 hard case for the video (S5.2)
- [ ] "How the AI works" slide content (S5.3)

**Done**
- [x] Package, schemas, mock, contract tests (S0.2, S0.3, S1.1)
- [x] Real LLM access check (S0.1, Groq)
- [x] Evaluation plan (S0.5) — `eval/README.md`; AI docs: this README, `MODEL_CARD.md`, `DECISIONS.md`
- [x] Zero-shot baseline (S0.4) — measured on the test split instead of 10 laptop images
- [x] Datasets + licences (S0.6), detector trained v1 + v2, v2 shipped
- [x] Sensor anomaly real (S1.2)
- [x] Backend tests patched to work with the real package
