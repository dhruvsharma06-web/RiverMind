"""Real sensor-anomaly detection (P2 S1.2). Three checks, each explained in plain English:

1. abs_limit  — pH outside 6.5-8.5, or turbidity above ANOMALY_MAX_TURBIDITY_NTU (default 100, a demo setting, not a
                regulatory limit). Fires only when the reading NEWLY crosses a limit (the recent median was inside it),
                so a river that sits outside a limit does not raise an event every 10 seconds.
2. robust_z   — per sensor, robust z-score against the device's own readings from the last 2 hours:
                z = 0.6745 * (x - median) / MAD, flagged when |z| > 3.5. Turbidity and TDS count only rises;
                pH and temperature count both directions. MAD has a per-sensor floor (sensor noise).
3. isolation_forest — IsolationForest(contamination=0.02) on the robust z-scores of the 4 values and of their
                latest changes. It is trained once on SIMULATED normal data (standard-normal z-scores), so "normal"
                means "unremarkable for this device", not an assumed Yamuna level. It catches several sensors drifting
                together even when none crosses 3.5 on its own.

score (0-1, the backend turns it into severity = ceil(5 x score), which sets the bounty size):
- z-score breach: min(significance, physical size), at least 0.2. Significance is a log scale from 0.35 at |z| = 3.5
  to 1.0 at |z| >= 30. Physical size: turbidity rise relative to the median (3x = 1.0), TDS rise (2x = 1.0),
  pH change (1.5 units = 1.0), temperature change (6 °C = 1.0). Quiet sensors give huge z for small changes, so
  significance alone would call every blip "severity 5". These scales are our heuristics, not calibrated on data.
- new limit breach: 0.6. Forest alone: 0.4.
"""
import math
import statistics
from datetime import datetime, timedelta
from functools import lru_cache
from typing import NamedTuple

import numpy as np

from rivermind_ai import config
from rivermind_ai.schemas import AnomalyResult, SensorReading

VERSION = "anomaly-v1"
WINDOW = timedelta(hours=2)
MIN_HISTORY = 8
Z_LIMIT = 3.5
Z_SATURATE = 30.0
PH_RANGE = (6.5, 8.5)
DEFAULT_MAX_TURBIDITY_NTU = 100.0
FOREST_SCORE, LIMIT_SCORE, MIN_SCORE = 0.4, 0.6, 0.2


class Sensor(NamedTuple):
    key: str  # value of AnomalyResult.sensor
    label: str  # how the reason names it
    field: str
    unit: str
    mad_floor: float  # typical sensor noise, so a perfectly flat history does not divide by ~0
    rises_only: bool  # turbidity / TDS: only increases mean pollution
    full_scale: float  # change that counts as maximum physical size (relative for rises_only, else absolute)


SENSORS = (
    Sensor("turbidity", "turbidity", "turbidity_ntu", "NTU", 0.5, True, 2.0),
    Sensor("ph", "pH", "ph", "", 0.02, False, 1.5),
    Sensor("tds", "TDS", "tds_ppm", "ppm", 2.0, True, 1.0),
    Sensor("temperature", "temperature", "temp_c", "°C", 0.1, False, 6.0),
)


def _physical_size(s: Sensor, x: float, median: float) -> float:
    change = (x / median - 1) if s.rises_only and median > 0 else abs(x - median)
    return min(1.0, max(0.0, change / s.full_scale))


@lru_cache
def _forest():
    from sklearn.ensemble import IsolationForest  # [real] extra; imported lazily

    simulated_normal = np.random.default_rng(0).standard_normal((5000, 2 * len(SENSORS)))
    return IsolationForest(n_estimators=200, contamination=0.02, random_state=0).fit(simulated_normal)


def _ts(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _window(reading: SensorReading, history: list[SensorReading]) -> list[SensorReading]:
    """History from the 2 hours before the reading (all of it if timestamps can't be read)."""
    now = _ts(reading.ts)
    if now is None:
        return list(history)
    return [h for h in history if (t := _ts(h.ts)) is not None and timedelta(0) <= now - t <= WINDOW]


def _robust_z(x: float, past: list[float], floor: float) -> tuple[float, float]:
    median = statistics.median(past)
    mad = max(statistics.median(abs(p - median) for p in past), floor)
    return 0.6745 * (x - median) / mad, median


def _fmt(value: float, unit: str) -> str:
    return f"{value:.1f} {unit}" if unit else f"{value:.2f}"


def _z_score_to_severity_score(z: float) -> float:
    return min(1.0, 0.35 + 0.65 * math.log(max(z, Z_LIMIT) / Z_LIMIT) / math.log(Z_SATURATE / Z_LIMIT))


def _sentence(parts: list[str]) -> str:
    text = "; ".join(parts)
    if text[1:2].islower():  # capitalise "turbidity ..." but leave "pH ..." alone
        text = text[:1].upper() + text[1:]
    return text + "."


def detect(reading: SensorReading, history: list[SensorReading]) -> AnomalyResult:
    past = _window(reading, history)
    max_turbidity = config.get_float("ANOMALY_MAX_TURBIDITY_NTU", DEFAULT_MAX_TURBIDITY_NTU)
    fired: list[str] = []
    reasons: list[str] = []
    score, main = 0.0, None

    # 1. absolute limits — work even without history; only a NEW crossing counts
    ph_median = statistics.median(h.ph for h in past) if past else None
    turb_median = statistics.median(h.turbidity_ntu for h in past) if past else None
    if not PH_RANGE[0] <= reading.ph <= PH_RANGE[1] and (ph_median is None or PH_RANGE[0] <= ph_median <= PH_RANGE[1]):
        fired.append("abs_limit")
        reasons.append(f"pH {reading.ph:.2f} is outside the safe range {PH_RANGE[0]}-{PH_RANGE[1]}")
        score, main = LIMIT_SCORE, "ph"
    if reading.turbidity_ntu > max_turbidity and (turb_median is None or turb_median <= max_turbidity):
        fired.append("abs_limit")
        reasons.append(f"turbidity {reading.turbidity_ntu:.1f} NTU is above the {max_turbidity:.0f} NTU limit")
        score, main = LIMIT_SCORE, main or "turbidity"

    if len(past) < MIN_HISTORY:
        note = f"not enough recent history for trend checks ({len(past)} of {MIN_HISTORY} readings)"
        if not fired:
            return AnomalyResult(anomaly=False, score=0.0, method=f"{VERSION}:none",
                                 reason=_sentence([f"within limits; {note}"]))
        return AnomalyResult(anomaly=True, score=score, sensor=main, method=f"{VERSION}:abs_limit",
                             reason=_sentence(reasons))

    # 2. robust z-score per sensor, for the value and for its latest change
    value_z, delta_z = [], []
    worst_score, worst_key = 0.0, None
    for s in SENSORS:
        series = [getattr(h, s.field) for h in past]
        x = getattr(reading, s.field)
        z, median = _robust_z(x, series, s.mad_floor)
        dz, _ = _robust_z(x - series[-1], [b - a for a, b in zip(series, series[1:], strict=False)], s.mad_floor)
        value_z.append(z)
        delta_z.append(dz)
        strength = z if s.rises_only else abs(z)
        if strength > Z_LIMIT:
            fired.append("robust_z")
            reasons.append(f"{s.label} {'rose' if z > 0 else 'fell'} to {_fmt(x, s.unit)}, {abs(z):.1f} robust "
                           f"standard deviations from its recent median of {_fmt(median, s.unit)}")
            sensor_score = max(MIN_SCORE, min(_z_score_to_severity_score(strength), _physical_size(s, x, median)))
            if sensor_score > worst_score:
                worst_score, worst_key = sensor_score, s.key
    if worst_key:
        score, main = max(score, worst_score), main or worst_key

    # 3. isolation forest on all z-scores together — only consulted when no single rule fired
    if not fired:
        features = np.clip(np.array([value_z + delta_z]), -50, 50)
        if _forest().predict(features)[0] == -1:
            top = sorted(zip(SENSORS, value_z, strict=True), key=lambda pair: -abs(pair[1]))[:2]
            fired.append("isolation_forest")
            reasons.append("several readings shifted together in an unusual way ("
                           + ", ".join(f"{s.label} z={z:+.1f}" for s, z in top) + ")")
            score, main = FOREST_SCORE, top[0][0].key

    if not fired:
        s, z = max(zip(SENSORS, value_z, strict=True), key=lambda pair: abs(pair[1]))
        return AnomalyResult(anomaly=False, score=round(min(1.0, abs(z) / Z_SATURATE), 2), method=f"{VERSION}:none",
                             reason=_sentence([f"all readings within normal variation (largest shift: {s.label} "
                                               f"z={z:+.1f}, over {len(past)} recent readings)"]))
    return AnomalyResult(anomaly=True, score=round(min(1.0, score), 2), sensor=main,
                         method=f"{VERSION}:{'+'.join(dict.fromkeys(fired))}", reason=_sentence(reasons))
