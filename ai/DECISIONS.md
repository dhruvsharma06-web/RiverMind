# AI decisions log (P2)

Newest last. Each entry: what we decided, why, and what it costs us. Team-wide decisions live in `PROJECT.md`.

**AI-1 — Train our own waste detector instead of asking an LLM to find waste** (Tue 10 Nov)
Why: countable boxes, fast and free per call, runs offline on CPU, and gives us a real trained-model story with
measured accuracy. Cost: training time on Colab; accuracy limited by public data.

**AI-2 — Use public, pre-labelled datasets; no manual labelling; Yamuna photos not required** (Tue 10 Nov)
Why: no time to label. Chosen: Mendeley turbid-river floating waste (CC BY 4.0, YOLO labels, leak-free split by
video) as the base. Rejected: Riverine Plastic Litter (Mendeley record has 0 files), Dal Lake FloPWD
(segmentation masks, not boxes), Kili plastic_in_river (gated / download errors; class names unknown on the
Roboflow copy), Float Plastics and floating-plastic-waste-river (no downloadable versions). Cost: the model has
never seen the Yamuna.

**AI-3 — Hybrid AI: our detector for detection/counting, a vision LLM for judgement and text** (Tue 10 Nov)
Why: a detector cannot judge "same place?", "really cleaned?" or "photo of a screen?", and the contract has an
`llm` check; the river's "agent" also needs words. Without an LLM we'd need a contract change and would lose the
fake-photo check. Cost: one LLM dependency (free tier).

**AI-4 — LLM provider: Groq (`qwen/qwen3.8-27b`), with Claude / Gemini as switchable backups** (Tue 10 Nov)
Why: the team wanted "Grok" because it's free; the key turned out to be a **Groq** key (`gsk_…`), which is a
different company. Groq's free tier serves a Qwen model that reads images and returns JSON (0.80 s in our check).
Cost: free-tier rate limits; model availability on Groq can change — hence the backups.

**AI-5 — Sensor anomalies: the IsolationForest works on each device's robust z-scores** (Tue 10 Nov)
Why: the prompt said "train on simulated normal data"; simulating absolute Yamuna levels would flag every reading
from a sensor in a tank of clean water. Training on simulated standard-normal z-scores keeps it device-agnostic.
Limits fire only on a *new* crossing to avoid an event every 10 s.

**AI-6 — Anomaly severity = min(statistical significance, physical size)** (Tue 10 Nov)
Why: quiet sensors produce huge z-scores for small changes; a linear z scale made a 38 → 60 NTU rise "severity 5".
Severity drives bounty size, so it must reflect how big the change physically is. Scales are heuristics.

**AI-7 — Bottle/bag classes via a second dataset + teacher relabelling (v2)** (Tue 10 Nov)
Why: the user wanted bottles vs bags. River Trash final (CC BY 4.0) has them; a teacher model was used to relabel
the Mendeley "floating waste" boxes. Outcome: the teacher changed only 1 of 3,066 boxes (close-up vs distant
photos), so bottle/bag come from River Trash only. v2 training stopped manually after epoch 52/60.

**AI-8 — Ship v2, not v1** (Tue 10 Nov)
Why: on turbid-river test frames v2 is slightly behind (waste mAP50 0.364 vs 0.390, count error 1.98 vs 1.82),
but on a different photo style v1 collapses (0.017) while v2 holds (0.789). App photos come from phones, so
generalisation matters more; v2 also has bottle/bag. Both scored with one evaluator (`eval/RESULTS.md`).

**AI-9 — Verification eval without field photos** (Tue 10 Nov, planned)
Why: the user prefers not to shoot 20 before/after pairs. The test split contains consecutive video frames of the
same scenes, so: "cleanup" pairs = two same-scene frames with the labelled waste digitally removed (inpainting) from
the after photo; "no cleanup" pairs = untouched same-scene frames; fakes generated (same photo twice, reused photo,
different place, unrelated photo, "APPROVE PAYMENT" text). Cost: simulated cleanups; the inpainting may itself be
flagged as editing. Must be disclosed wherever the numbers are shown.

**AI-10 — Fix the backend tests in our PR rather than waiting for the owner** (Tue 10 Nov)
Why: installing `rivermind_ai` made 14 backend tests fail because they patched the stand-in by name. A 4-file,
tests-only change (patch the AI class the adapter really uses) passes 213/213 with and without our package. Arnav
and Dhruv get a heads-up; no backend app code changed.
