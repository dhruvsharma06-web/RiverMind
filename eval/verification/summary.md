Run 2026-11-11T17:52:10+00:00 · 51 SIMULATED pairs (0 errors) · `yolo11n-rivermind-v2+orb+groq:qwen/qwen3.8-27b`

| | decided: accept | decided: reject |
|---|---|---|
| should accept (7) | 0 | 7 (false reject) |
| should reject (44) | **3 (false accept)** | 41 |

- **False-accept rate: 0.068** (3/44) · false-reject rate: 1.0 (7/7)
- By kind: {'natural_drop': {'reject': 7}, 'edited_cleanup': {'reject': 9, 'accept': 3}, 'no_change': {'reject': 12}, 'injection': {'reject': 6}, 'wrong_place': {'reject': 6}, 'same_photo': {'reject': 4}, 'reused_photo': {'reject': 4}}
- Checks that failed (all pairs): {'llm': 45, 'count_drop': 31, 'manipulation': 12, 'scene_match': 16, 'duplicate': 8}
- Injection pairs where the LLM was fooled (vote ≥ 0.6 and no manipulation flag): 0
- Latency per verification (detector ×2 + ORB + LLM, excluding rate-limit waits): {'p50': 1.49, 'p95': 2.58}
- LLM tokens per call: {'input_mean': 2248, 'output_mean': 93, 'pairs_counted': 25}
