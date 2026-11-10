"""Waste detector: the shipped YOLO11n v2 ONNX run with onnxruntime on CPU (numpy pre/post-processing, no torch).

- Input: letterbox to 960x960 (grey 114 padding), RGB, 0-1, NCHW.
- Output [1, 8, 18900]: cx, cy, w, h (input pixels) + one score per class (bottle, bag, other, vegetation).
- Keep boxes with confidence >= 0.25 (the threshold eval/RESULTS.md counts at), class-wise NMS at IoU 0.7
  (Ultralytics' default, which the eval used). Vegetation is dropped from counts and boxes (CONTRACT.md).
- waste_score = 1 - prod(1 - conf) over the kept waste boxes ("probability at least one box is real waste" if the
  boxes were independent). 0 when nothing is found.
- foam_ratio is NOT from the detector (it has no foam class): it is the HSV colour rule in imaging.foam_ratio.
"""
import threading
from pathlib import Path

import numpy as np
from PIL import Image

from rivermind_ai import config, imaging
from rivermind_ai.errors import AIUnavailable
from rivermind_ai.schemas import Box, Counts, Detection

VERSION = "yolo11n-rivermind-v2"
INPUT_SIDE = 960
CONF_THRESHOLD = 0.25
NMS_IOU = 0.7
MAX_BOXES = 100
CLASSES = ("bottle", "bag", "other", "vegetation")
WASTE_CLASSES = ("bottle", "bag", "other")
DEFAULT_MODEL = Path(__file__).resolve().parent.parent / "models" / "yolo11n-rivermind-v2.onnx"

_lock = threading.Lock()
_session = None


def _get_session():
    global _session
    if _session is None:
        with _lock:
            if _session is None:
                try:
                    import onnxruntime as ort

                    opts = ort.SessionOptions()
                    opts.intra_op_num_threads = 2
                    opts.inter_op_num_threads = 1
                    opts.enable_cpu_mem_arena = False  # keeps peak RAM down on Render's 512 MB
                    path = config.get("DETECTOR_MODEL_PATH") or str(DEFAULT_MODEL)
                    _session = ort.InferenceSession(path, sess_options=opts, providers=["CPUExecutionProvider"])
                except Exception as exc:  # missing extra, missing/corrupt model file
                    raise AIUnavailable("waste detector could not be loaded") from exc
    return _session


def _letterbox(img: Image.Image) -> tuple[np.ndarray, float, int, int]:
    w, h = img.size
    scale = INPUT_SIDE / max(w, h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    canvas = Image.new("RGB", (INPUT_SIDE, INPUT_SIDE), (114, 114, 114))
    pad_x, pad_y = (INPUT_SIDE - nw) // 2, (INPUT_SIDE - nh) // 2
    canvas.paste(img.resize((nw, nh), Image.BILINEAR), (pad_x, pad_y))
    arr = np.asarray(canvas, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
    return arr, scale, pad_x, pad_y


def _nms(boxes: np.ndarray, scores: np.ndarray, iou: float) -> list[int]:
    order, keep = scores.argsort()[::-1], []
    areas = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
    while order.size:
        i = order[0]
        keep.append(int(i))
        rest = order[1:]
        xx1, yy1 = np.maximum(boxes[i, 0], boxes[rest, 0]), np.maximum(boxes[i, 1], boxes[rest, 1])
        xx2, yy2 = np.minimum(boxes[i, 2], boxes[rest, 2]), np.minimum(boxes[i, 3], boxes[rest, 3])
        inter = np.clip(xx2 - xx1, 0, None) * np.clip(yy2 - yy1, 0, None)
        overlap = inter / (areas[i] + areas[rest] - inter + 1e-9)
        order = rest[overlap <= iou]
    return keep


def detect_boxes(img: Image.Image) -> tuple[list[tuple[str, float, list[float]]], float]:
    """All kept detections (including vegetation) as (class, confidence, normalised xyxy), best first, plus the
    highest raw waste-class score anywhere in the image (also below the threshold)."""
    session = _get_session()
    arr, scale, pad_x, pad_y = _letterbox(img)
    out = session.run(None, {session.get_inputs()[0].name: arr})[0][0].T  # (18900, 8)
    cls_scores = out[:, 4:]
    best_waste = float(cls_scores[:, :3].max()) if cls_scores.size else 0.0
    cls_ids, conf = cls_scores.argmax(1), cls_scores.max(1)
    mask = conf >= CONF_THRESHOLD
    if not mask.any():
        return [], best_waste
    xywh, cls_ids, conf = out[mask, :4], cls_ids[mask], conf[mask]
    xyxy = np.stack([xywh[:, 0] - xywh[:, 2] / 2, xywh[:, 1] - xywh[:, 3] / 2,
                     xywh[:, 0] + xywh[:, 2] / 2, xywh[:, 1] + xywh[:, 3] / 2], axis=1)
    w, h = img.size
    xyxy = (xyxy - [pad_x, pad_y, pad_x, pad_y]) / scale / [w, h, w, h]
    xyxy = np.clip(xyxy, 0.0, 1.0)
    results = []
    for c in np.unique(cls_ids):
        idx = np.where(cls_ids == c)[0]
        for k in _nms(xyxy[idx], conf[idx], NMS_IOU):
            j = idx[k]
            results.append((CLASSES[int(c)], float(conf[j]), [round(float(v), 4) for v in xyxy[j]]))
    results.sort(key=lambda r: -r[1])
    return results, best_waste


def waste_count(dets: list[tuple[str, float, list[float]]]) -> int:
    return sum(1 for cls, _, _ in dets if cls in WASTE_CLASSES)


def analyze(data: bytes) -> Detection:
    try:
        img = imaging.open_rgb(data)
    except ValueError as exc:
        raise AIUnavailable("image could not be decoded") from exc
    dets, best_waste = detect_boxes(img)
    waste = [d for d in dets if d[0] in WASTE_CLASSES]
    foam = imaging.foam_ratio(img)
    n = {c: sum(1 for d in waste if d[0] == c) for c in WASTE_CLASSES}
    counts = Counts(bottle=n["bottle"], bag=n["bag"], other=n["other"], foam=int(foam > imaging.FOAM_COUNT_THRESHOLD))
    score = round(1.0 - float(np.prod([1.0 - c for _, c, _ in waste])), 3) if waste else 0.0
    boxes = [Box(xyxy=xyxy, cls=cls, conf=round(conf, 3)) for cls, conf, xyxy in waste[:MAX_BOXES]]
    veg = len(dets) - len(waste)
    if waste:
        summary = (f"Detector found {len(waste)} floating waste item(s): {n['bottle']} bottle, {n['bag']} bag, "
                   f"{n['other']} other")
        confidence = round(sum(c for _, c, _ in waste[:5]) / min(5, len(waste)), 3)
    else:
        summary = "Detector found no floating waste"
        confidence = round(1.0 - best_waste, 3)  # how far the best candidate stayed from being a waste box
    if veg:
        summary += f"; {veg} vegetation patch(es) ignored"
    summary += f". Foam ratio {foam:.2f} from a colour rule, not the detector."
    return Detection(waste_detected=bool(waste), waste_score=score, counts=counts, boxes=boxes, foam_ratio=foam,
                     summary=summary, confidence=confidence, model_version=VERSION)
