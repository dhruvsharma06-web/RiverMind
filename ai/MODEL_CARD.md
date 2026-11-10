# Model card — RiverMind AI (draft, Tue 10 Nov 2026; finalised in S4.4)

## Summary (6 lines)
- **Purpose:** spot floating waste in river photos, flag water-quality spikes, and score before/after cleanup
  photos so that plain backend code can decide bounties and payouts. The AI never decides money.
- **Model / version:** waste detector YOLO11n fine-tuned, `yolo11n-rivermind-v2` (ONNX, 10.8 MB, CPU);
  sensor anomaly `anomaly-v1` (robust z-score + limits + IsolationForest); vision LLM `qwen/qwen3.8-27b` on Groq
  (planned for bounty text, verification vote, diary).
- **Data:** public, pre-labelled, CC BY 4.0 — Mendeley turbid-river floating waste (1,577 photos) and Roboflow
  *River Trash final* (1,753 photos). No Yamuna photos, no manual labels. Credits: `ATTRIBUTION.md`.
- **Metric:** held-out test splits — turbid rivers waste mAP50 **0.364** (zero-shot baseline 0.033), count error
  1.98 items per image (true mean 4.13); River Trash waste mAP50 **0.789**, bottle 0.51, bag 0.41. Details:
  `eval/RESULTS.md`.
- **Limits:** modest accuracy on small, distant objects in murky water; bottle/bag learned only from close-up
  photos (distant items mostly come out as "other"); not tested on Yamuna photos; anomaly severity scales are
  heuristics; verification eval will use simulated cleanups.
- **Fallback:** any provider failure, timeout or invalid output raises `AIUnavailable` / `InvalidOutput` → the API
  answers 503 `AI_UNAVAILABLE`; no invented results. Mock mode is labelled `mock-1`.

## Detector details
| | |
|---|---|
| Architecture | YOLO11n (Ultralytics 8.4.43), 2.6 M parameters, input 960×960, output [1, 8, 18900] |
| Classes | bottle, bag, other, vegetation (vegetation dropped from counts and boxes) |
| Training | COCO-pretrained YOLO11n; 2,334 train / 664 val images from both datasets; stopped after epoch 52/60 |
| Runtime | onnxruntime CPU, ~76 ms per image on the dev laptop; memory to be re-measured on Linux (Render 512 MB) |
| Licence | Ultralytics YOLO weights: AGPL-3.0; repo: MIT |
| Previous version | v1 (Mendeley only, 2 classes): better on turbid frames (0.390) but fails on other photo styles (0.017) |

## Sensor anomaly details
Three checks (absolute limits, robust z-score > 3.5 on the last 2 hours, IsolationForest on z-scores trained on
simulated normal data). Unit-tested with injected spikes only; not yet evaluated on real sensor data.
See `README.md` §3.4.

## Safety
- Images, worker notes and any text inside images are treated as data, never instructions (planned prompt rule +
  injection tests in S4.1).
- Every output is schema-validated (`extra="forbid"`); invalid output → one retry → error.
- The AI returns per-check scores only; geo, time, duplicate and the overall pass/fail are computed by the backend.
