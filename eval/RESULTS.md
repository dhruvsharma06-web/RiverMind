# RiverMind AI — measured results

Real numbers only. Every row says what was run, on what, and when. Nothing here is projected.

## S0.1 — vision-LLM access check (Tue 10 Nov 2026, IST)

| Provider | Model | Input | Output format | Latency (wall, 1 call) | Tokens in / out | Cost |
|---|---|---|---|---|---|---|
| Groq | `qwen/qwen3.8-27b` | 1 river photo from the dataset's test split (`FOTO_0002.jpg`, resized to 1024×454 JPEG) + a short instruction | JSON object (`response_format: json_object`), parsed OK | 0.80 s | 823 / 37 | $0 on Groq's free tier (rate-limited) |

- This was a single call, so it proves access but doesn't give a latency distribution. p50/p95 come in S2.4 over the eval set.
- Other models the key can use (`openai/gpt-oss-*`, `llama-prompt-guard-*`, whisper) are text-only or audio. The Qwen model is the only vision option seen on this key.
- Backups behind `LLM_PROVIDER`: Claude API and Gemini, not tested yet (no keys).

## Detector v1: fine-tuned YOLO11n vs zero-shot baseline (Tue 10 Nov 2026, IST)

Held-out **test split** of the Mendeley *Floating Waste and Aquatic Vegetation from Turbid Rivers* v2 dataset
(157 images after skipping 1 with an EXIF rotation tag; 648 floating-waste boxes, 126 vegetation boxes). Neither
model saw these images during training. Run in `ai/tools/train_detector.ipynb` on Colab (T4 GPU, Ultralytics 8.4.43,
torch 2.14.1+cu130, Python 3.13), image size 960, Ultralytics `val` metrics.

| Model | Training | mAP50 (both classes) | mAP50-95 | Precision | Recall | mAP50 waste ("other") | mAP50 vegetation |
|---|---|---|---|---|---|---|---|
| **YOLO11n (ours, v1)** | fine-tuned on the dataset's train split (1,102 images); stopped early at epoch 55/60 (best val mAP50 0.377 at epoch 40), 38 min on a T4 | **0.371** | **0.120** | 0.446 | 0.409 | **0.409** | 0.333 |
| YOLO-World v2 (`yolov8s-worldv2`) | none — zero-shot, prompts "floating trash", "aquatic plants" | 0.039 | 0.009 | 0.064 | 0.280 | 0.029 | 0.049 |

- The fine-tuned model is roughly 10x the zero-shot baseline on mAP50. 0.37 is still modest in absolute terms:
  objects are small (median box ~0.6% of the image) in turbid water.
- Raw files: `eval/detector/v1/` (`metrics_test.json`, `baseline_test.json`, per-epoch `results.csv`).
- Count error per image and the v1 / v2 / baseline comparison on both test splits come from `train_detector_v2.ipynb`.

### v1 ONNX checks (v1 is no longer the shipped model; see v2 below)
- 10.8 MB (contract cap 25 MB); input `images` [1, 3, 960, 960], output [1, 6, 18900]; class names in metadata.
- ONNX vs PyTorch weights on the Mendeley test split (same evaluator): waste mAP50 0.384 vs 0.390 — the export is
  faithful.
- onnxruntime 1.31 CPU on the dev laptop (Intel Core Ultra 7 155U, Windows): median 70 ms per image (5 runs).
- Memory on that laptop (Windows working set): 355 MB after loading onnxruntime + model + OpenCV + scikit-learn and
  3 inferences. Render's free instance has 512 MB for the whole backend, so this must be re-measured on Linux and
  reduced (thread / memory-arena limits) before deploy.

## Detector v2: bottle / bag / other / vegetation — SHIPPED (Tue 10 Nov 2026, IST)

Trained with `ai/tools/train_detector_v2.ipynb` on Colab (T4). Data: Mendeley turbid-rivers train/val + *River Trash
final* v2 (Roboflow Universe, CC BY 4.0) train/val — 2,334 train / 664 val images. YOLO11n from COCO weights,
image size 960. **Training was stopped manually after epoch 52 of 60** (best val mAP50 0.433 at epoch 51, on the
merged val set — not comparable to v1's val number).

**Relabelling result (honest):** the teacher (YOLO11n trained on River Trash only; its own val mAP50 0.51 — bottle
0.63, bag 0.33, other 0.85) confidently matched only **1 of 3,066** Mendeley "floating waste" boxes to a bottle; the
rest stayed "other". River Trash photos are mostly close-ups, Mendeley's are distant, turbid video frames. So v2
learned bottle and bag **from River Trash only**; on distant turbid scenes expect mostly "other".

### Per class, River Trash test split (171 images, real labels, Ultralytics val)
| bottle | bag | other | vegetation (branches) |
|---|---|---|---|
| 0.510 | 0.414 | 0.860 | 0.066 |

The River Trash test split has only 16 bag boxes, so the bag number is noisy.

### Same evaluator for all models, both held-out test splits
Bottle/bag/other scored as one "waste" class; greedy matching at IoU 0.5 (our evaluator in the v2 notebook, not
identical to Ultralytics val). **Count error** = mean absolute difference per image between items counted at
confidence ≥ 0.25 and the true number of waste items — the quantity cleanup verification uses.

| Model | Mendeley test (157 imgs, turbid rivers): waste mAP50 | vegetation mAP50 | count error (true mean 4.13) | River Trash test (171 imgs): waste mAP50 | count error (true mean 1.44) |
|---|---|---|---|---|---|
| **v2 (shipped)** | 0.364 | **0.413** | 1.98 | **0.789** | **0.60** |
| v1 | **0.390** | 0.317 | **1.82** | 0.017 | 1.23 |
| zero-shot YOLO-World v2 | 0.033 | 0.040 | 4.10 | 0.375 | 1.45 |

- v2 and the zero-shot rows: Colab run (`eval/detector/v2/metrics_v2.json`). v1 row: same evaluator on the laptop
  CPU (`eval/detector/compare_v1_v2_laptop.json`); v2 re-scored on the laptop reproduced the Colab numbers exactly.
- **Why v2 ships:** slightly behind v1 on turbid video frames (−0.026 waste mAP50, +0.16 count error) but v1
  collapses on a different kind of photo (0.017) while v2 holds (0.789). App photos come from phones, not from the
  Mendeley videos, so generalisation matters more; v2 also adds the bottle/bag classes.

### Shipped ONNX (`ai/rivermind_ai/models/yolo11n-rivermind-v2.onnx`)
- 10.8 MB; input `images` [1, 3, 960, 960], output [1, 8, 18900]; names {0: bottle, 1: bag, 2: other,
  3: vegetation} in metadata. onnxruntime CPU on the dev laptop: median 76 ms per image (5 runs).
