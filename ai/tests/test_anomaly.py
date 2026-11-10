"""S1.2: real sensor anomaly detection with injected spikes (synthetic readings, labelled as such)."""
from datetime import UTC, datetime, timedelta

import numpy as np
import pytest

from rivermind_ai.factory import get_river_ai
from rivermind_ai.real import anomaly
from rivermind_ai.schemas import SensorReading

T0 = datetime(2026, 11, 10, 7, 0, tzinfo=UTC)
BASE = {"turbidity_ntu": 38.0, "ph": 7.4, "tds_ppm": 610.0, "temp_c": 24.0}
NOISE = {"turbidity_ntu": 1.5, "ph": 0.05, "tds_ppm": 6.0, "temp_c": 0.15}


def r(i: int, **values) -> SensorReading:
    return SensorReading(ts=(T0 + timedelta(seconds=10 * i)).isoformat().replace("+00:00", "Z"), **(BASE | values))


def history(n: int = 30, seed: int = 0, **base) -> list[SensorReading]:
    rng = np.random.default_rng(seed)
    centre = BASE | base
    return [r(i, **{k: round(centre[k] + rng.normal(0, NOISE[k]), 3) for k in BASE}) for i in range(n)]


def test_normal_reading_is_not_an_anomaly():
    out = anomaly.detect(r(30), history())
    assert not out.anomaly and out.method == "anomaly-v1:none" and "normal variation" in out.reason


def test_injected_turbidity_spike_is_flagged_with_a_reason():
    out = anomaly.detect(r(30, turbidity_ntu=85.0), history())
    assert out.anomaly and out.sensor == "turbidity" and "robust_z" in out.method
    assert out.reason.startswith("Turbidity rose to 85.0 NTU") and "recent median of 37.8 NTU" in out.reason
    assert 0.2 <= out.score <= 1


def test_bigger_spike_gives_higher_score():
    small = anomaly.detect(r(30, turbidity_ntu=50.0), history())
    big = anomaly.detect(r(30, turbidity_ntu=85.0), history())
    assert small.anomaly and big.anomaly and 0.2 <= small.score < big.score <= 1


def test_tiny_but_significant_change_is_low_severity():
    out = anomaly.detect(r(30, turbidity_ntu=45.0), history())  # +18%: statistically clear, physically small
    assert out.anomaly and out.score == 0.2  # severity 1


def test_turbidity_drop_is_not_pollution():
    assert not anomaly.detect(r(30, turbidity_ntu=5.0), history()).anomaly


def test_ph_out_of_range_is_flagged_by_limit_and_trend():
    out = anomaly.detect(r(30, ph=9.3), history())
    assert out.anomaly and out.sensor == "ph" and "abs_limit" in out.method and "robust_z" in out.method
    assert out.reason.startswith("pH 9.30 is outside the safe range 6.5-8.5")


def test_persistent_limit_breach_does_not_fire_again():
    out = anomaly.detect(r(30, ph=8.8), history(ph=8.8))
    assert not out.anomaly


def test_limits_work_without_history():
    assert not anomaly.detect(r(2), history(2)).anomaly
    out = anomaly.detect(r(2, ph=9.5), history(2))
    assert out.anomaly and out.method == "anomaly-v1:abs_limit" and out.score == 0.6


def test_turbidity_limit_is_configurable(monkeypatch):
    monkeypatch.setenv("ANOMALY_MAX_TURBIDITY_NTU", "40")
    out = anomaly.detect(r(2, turbidity_ntu=45.0), history(2))
    assert out.anomaly and "above the 40 NTU limit" in out.reason


def test_several_sensors_drifting_together_are_caught_by_the_forest():
    # each sensor shifted by ~2.5-3 robust SDs: below the 3.5 single-sensor rule, unusual together
    out = anomaly.detect(r(30, turbidity_ntu=41.0, ph=7.52, tds_ppm=622.0, temp_c=24.45), history())
    assert out.anomaly and out.method == "anomaly-v1:isolation_forest" and out.score == 0.4
    assert out.reason.startswith("Several readings shifted together")


def test_flat_history_does_not_divide_by_zero():
    flat = [r(i) for i in range(30)]
    assert not anomaly.detect(r(30, turbidity_ntu=38.2), flat).anomaly
    assert anomaly.detect(r(30, turbidity_ntu=60.0), flat).anomaly


def test_readings_older_than_two_hours_are_ignored():
    old = [SensorReading(ts=(T0 - timedelta(hours=3, seconds=10 * i)).isoformat(), **(BASE | {"turbidity_ntu": 300.0}))
           for i in range(30)]
    out = anomaly.detect(r(30, turbidity_ntu=85.0), old + history())
    assert out.anomaly and "recent median of 37.8 NTU" in out.reason  # with the 300 NTU readings it would be ~169


@pytest.mark.parametrize("value", [38.0, 85.0, 9.3])
def test_deterministic(value):
    reading = r(30, turbidity_ntu=value)
    assert anomaly.detect(reading, history()) == anomaly.detect(reading, history())


def test_real_adapter_uses_it():
    out = get_river_ai(False).detect_sensor_anomaly(r(30, turbidity_ntu=85.0), history())
    assert out.anomaly and out.method.startswith("anomaly-v1")
