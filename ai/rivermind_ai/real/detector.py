"""Our waste detector: YOLO11n (v2) exported to ONNX, run with onnxruntime on CPU. Loaded once, shared by all threads.

Pipeline: letterbox the RGB image to the model's square input (as in training, grey padding 114) → run →
keep anchors whose best class score ≥ conf → per-class non-max suppression (IoU 0.7) → map boxes back to the
original image, normalised 0-1.
"""
import ast
import threading
from dataclasses import dataclass
from importlib import resources
from pathlib import Path

import numpy as np

from rivermind_ai import config

DEFAULT_MODEL = "yolo11n-rivermind-v2.onnx"
CONF = 0.25  # default; tuned on the validation split later (never the test split)
NMS_IOU = 0.7  # Ultralytics' default
MAX_DET = 300
PAD_VALUE = 114
ORT_THREADS = 2  # keeps memory and CPU contention down on a small server; the backend runs up to 8 calls at once


@dataclass(frozen=True)
class Box:
    cls: str
    conf: float
    xyxy: tuple[float, float, float, float]  # normalised 0-1


class Detector:
    def __init__(self, path: Path):
        import onnxruntime as ort  # [real] extra; imported only when the real detector is first used

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = ORT_THREADS
        opts.inter_op_num_threads = 1
        opts.enable_cpu_mem_arena = False  # lower peak memory; we run one small image at a time
        self.session = ort.InferenceSession(str(path), sess_options=opts, providers=["CPUExecutionProvider"])
        meta = self.session.get_modelmeta().custom_metadata_map
        self.names: dict[int, str] = ast.literal_eval(meta["names"])
        self.size = int(ast.literal_eval(meta.get("imgsz", "[960, 960]"))[0])
        self.input = self.session.get_inputs()[0].name
        self.version = path.stem  # e.g. "yolo11n-rivermind-v2"

    def detect(self, rgb: np.ndarray, conf: float = CONF) -> list[Box]:
        """rgb: H x W x 3 uint8. Returns boxes sorted by confidence, highest first."""
        import cv2

        h, w = rgb.shape[:2]
        r = min(self.size / h, self.size / w)
        nh, nw = round(h * r), round(w * r)
        top, left = (self.size - nh) // 2, (self.size - nw) // 2
        canvas = np.full((self.size, self.size, 3), PAD_VALUE, dtype=np.uint8)
        canvas[top:top + nh, left:left + nw] = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_LINEAR)
        x = canvas.astype(np.float32).transpose(2, 0, 1)[None] / 255.0

        out = self.session.run(None, {self.input: x})[0][0].T  # (anchors, 4 + classes)
        scores = out[:, 4:]
        cls = scores.argmax(axis=1)
        best = scores[np.arange(len(cls)), cls]
        keep = best >= conf
        boxes_cxcywh, cls, best = out[keep, :4], cls[keep], best[keep]
        if not len(best):
            return []
        xyxy = np.concatenate([boxes_cxcywh[:, :2] - boxes_cxcywh[:, 2:] / 2,
                               boxes_cxcywh[:, :2] + boxes_cxcywh[:, 2:] / 2], axis=1)
        kept = _nms(xyxy, best, cls)[:MAX_DET]
        xyxy = xyxy[kept]
        xyxy[:, [0, 2]] = ((xyxy[:, [0, 2]] - left) / r).clip(0, w) / w
        xyxy[:, [1, 3]] = ((xyxy[:, [1, 3]] - top) / r).clip(0, h) / h
        return [Box(self.names[int(c)], round(float(s), 4), tuple(round(float(v), 4) for v in b))
                for b, s, c in zip(xyxy, best[kept], cls[kept], strict=True)]


def _nms(xyxy: np.ndarray, scores: np.ndarray, classes: np.ndarray) -> list[int]:
    """Per-class greedy non-max suppression; returns kept indices, highest score first."""
    shifted = xyxy + classes[:, None] * 10_000.0  # boxes of different classes never overlap
    order = list(np.argsort(-scores))
    kept: list[int] = []
    while order:
        i = order.pop(0)
        kept.append(int(i))
        if not order:
            break
        rest = np.array(order)
        lt = np.maximum(shifted[i, :2], shifted[rest, :2])
        rb = np.minimum(shifted[i, 2:], shifted[rest, 2:])
        inter = np.clip(rb - lt, 0, None).prod(axis=1)
        area = lambda b: (b[..., 2] - b[..., 0]) * (b[..., 3] - b[..., 1])  # noqa: E731
        iou = inter / np.maximum(area(shifted[i]) + area(shifted[rest]) - inter, 1e-9)
        order = [j for j, o in zip(rest, iou, strict=True) if o <= NMS_IOU]
    return kept


def model_path() -> Path:
    custom = config.get("DETECTOR_MODEL_PATH")
    if custom:
        return Path(custom)
    return Path(str(resources.files("rivermind_ai") / "models" / DEFAULT_MODEL))


_lock = threading.Lock()
_detector: Detector | None = None


def get() -> Detector:
    """The shared detector, created on first use (never at import time)."""
    global _detector
    if _detector is None:
        with _lock:
            if _detector is None:
                _detector = Detector(model_path())
    return _detector
