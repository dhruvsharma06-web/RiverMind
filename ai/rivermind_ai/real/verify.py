"""Cleanup verification scores (no LLM). Thresholds from CONTRACT.md "Verification policy".

- scene_match: ORB keypoints (OpenCV) matched before→after, RANSAC homography; passed when inliers >= 25.
- count_drop: detector waste counts; passed when before >= 1 and after <= 0.4 x before.
- llm: NO vision LLM is called. `vote` is a deterministic proxy = mean(min(1, inliers/50), count drop share);
  notes and model_version say so.
- manipulation: not checked (needs a vision model) → flagged=False, stated in the explanation.
The backend computes geo, time, duplicate (pHash) and the overall decision.
"""
import numpy as np
from PIL import Image

from rivermind_ai import imaging
from rivermind_ai.errors import AIUnavailable
from rivermind_ai.real import detector
from rivermind_ai.schemas import CountDrop, LlmVote, Manipulation, SceneMatch, VerificationScores, VerifyCtx

VERSION = f"{detector.VERSION}+orb-v1+proxy-vote-no-llm"
MIN_INLIERS = 25
MAX_AFTER_SHARE = 0.4
MIN_VOTE = 0.6
ORB_SIDE = 800


def _gray(img: Image.Image) -> np.ndarray:
    copy = img.copy()
    copy.thumbnail((ORB_SIDE, ORB_SIDE))
    return np.asarray(copy.convert("L"))


def orb_inliers(a: Image.Image, b: Image.Image) -> int:
    import cv2

    orb = cv2.ORB_create(nfeatures=1500)
    ka, da = orb.detectAndCompute(_gray(a), None)
    kb, db = orb.detectAndCompute(_gray(b), None)
    if da is None or db is None or len(ka) < 4 or len(kb) < 4:
        return 0
    pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(da, db, k=2)
    good = [p[0] for p in pairs if len(p) == 2 and p[0].distance < 0.75 * p[1].distance]
    if len(good) < 4:
        return 0
    src = np.float32([ka[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([kb[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    _, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    return int(mask.sum()) if mask is not None else 0


def verify(before: bytes, after: bytes, ctx: VerifyCtx) -> VerificationScores:
    try:
        img_b, img_a = imaging.open_rgb(before), imaging.open_rgb(after)
    except ValueError as exc:
        raise AIUnavailable("proof image could not be decoded") from exc
    inliers = orb_inliers(img_b, img_a)
    n_before = detector.waste_count(detector.detect_boxes(img_b)[0])
    n_after = detector.waste_count(detector.detect_boxes(img_a)[0])
    drop_ok = n_before >= 1 and n_after <= MAX_AFTER_SHARE * n_before
    drop_share = max(0.0, 1.0 - n_after / max(n_before, 1)) if n_before else 0.0
    vote = round((min(1.0, inliers / 50) + drop_share) / 2, 2)
    return VerificationScores(
        scene_match=SceneMatch(passed=inliers >= MIN_INLIERS, inliers=inliers),
        count_drop=CountDrop(passed=drop_ok, before_count=n_before, after_count=n_after),
        llm=LlmVote(passed=vote >= MIN_VOTE, vote=vote,
                    notes="No vision LLM configured: deterministic proxy vote = mean(scene match, count drop)."),
        manipulation=Manipulation(flagged=False),
        before_phash=imaging.phash(before), after_phash=imaging.phash(after),
        explanation=(f"ORB scene match {inliers} inliers (need {MIN_INLIERS}); detector waste count {n_before} -> "
                     f"{n_after} (need >=1 -> <={MAX_AFTER_SHARE:.0%}). Manipulation not checked (no vision model). "
                     "Geo, time and duplicate checks are done by the backend."),
        model_version=VERSION,
    )
