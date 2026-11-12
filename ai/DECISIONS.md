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

**AI-9 — Verification eval without field photos** (Tue 10 Nov, planned; refined by AI-15, AI-19, AI-21)
Why: the user prefers not to shoot 20 before/after pairs. The test split contains consecutive video frames of the
same scenes, so: "cleanup" pairs = two same-scene frames with the labelled waste digitally removed (inpainting) from
the after photo; "no cleanup" pairs = untouched same-scene frames; fakes generated (same photo twice, reused photo,
different place, unrelated photo, "APPROVE PAYMENT" text). Cost: simulated cleanups; the inpainting may itself be
flagged as editing. Must be disclosed wherever the numbers are shown.

**AI-10 — Fix the backend tests in our PR rather than waiting for the owner** (Tue 10 Nov)
Why: installing `rivermind_ai` made 14 backend tests fail because they patched the stand-in by name. A 4-file,
tests-only change (patch the AI class the adapter really uses) passes 213/213 with and without our package. Arnav
and Dhruv get a heads-up; no backend app code changed.

**AI-11 — No stand-in vote when the LLM fails** (Wed 11 Nov, agreed with the team)
Why: verification releases money. If the LLM is down, rate-limited or answers badly, `verify_cleanup` raises; the
API returns 503 and the claim stays open for a resubmit. A guessed vote would let a payout through without the
check that catches fakes. (Bounty text is different: no money moves there, so it falls back to labelled rules.)

**AI-12 — `waste_score` calibrated to the backend's fixed 0.5 event line** (Wed 11 Nov)
Why: the backend opens an event at 0.5 and that number is in the contract. On the validation split the best
separator was "any waste item at confidence ≥ 0.25" (85% of waste photos flagged vs 20% of waste-free ones), so the
noisy-OR score is mapped to put that point at 0.5. Tuned on validation only; test splits untouched.

**AI-13 — Foam stays out of `waste_score`** (Wed 11 Nov)
Why: no dataset labels foam, so the colour rule's false-alarm rate is unknown — and it fired on murky test frames
(29% "foam"). It is reported in `counts.foam` and the summary, but cannot open an event on its own.

**AI-14 — Text asking to approve or pay counts as manipulation** (Wed 11 Nov)
Why: the verifier prompt treats text in photos as scene content, never instructions; legitimate cleanup photos never
need an "approve payment" sign, so such text is a manipulation sign → the claim fails.

**AI-15 — Evaluation pairs: matched design, each pair evaluated on its own** (Wed 11 Nov)
Why: the held-out split has only 11 scenes with more than one frame, and frames of one video are near-identical to
the pHash duplicate rule. So each of 12 same-scene frame pairs is used three ways (digitally cleaned / untouched /
with injected text), and pairs don't share duplicate history — except the deliberate "reused photo" cases, which are
checked against the earlier cleanup photos. Everything is labelled simulated.

**AI-16 — Only Groq is implemented in the LLM client** (Wed 11 Nov)
Why: no Claude/Gemini keys to test with; selecting them raises `AIUnavailable` rather than running untested code.

**AI-17 — Memory: one shared detector, 2 ONNX threads, no memory arena, smaller sensor forest** (Wed 11 Nov)
Why: Render's free instance has 512 MB for the whole backend. Measured on the dev laptop (Windows) with the backend
loaded: ~200–270 MB working set in steady use, peaks ~330–400 MB depending on whether the sensor forest is loaded.
Must be re-checked on Render (Linux); `AI_DETECTOR=llm` is the fallback if it doesn't fit.

**AI-18 — Verifier prompt v2: only man-made litter counts; chosen on the dev set** (Wed 11 Nov)
Why: in the live e2e runs v1 rejected natural same-scene pairs because it judged floating vegetation too (vote 0.1),
and on the dev set (train + val frames) it let 1 of 3 digitally erased "cleanups" through. v2 tells the model that
plants are not waste (the contract's own rule). Compared on the dev set only, never the test split. Evidence is thin
because Groq's daily limit cut the comparison short; both versions stay in `vision.VERIFY_PROMPTS` for traceability.

**AI-19 — Digitally erased trash is a fraud case, not a stand-in for a cleanup** (Wed 11 Nov)
Why: the vision model correctly flags inpainted photos as edited, so they can't play the honest-cleanup role. The
honest positive class is now `natural_drop` (real, unedited frames where waste drifted away); erased pairs are
`edited_cleanup`, expected reject.

**AI-20 — Keep evaluation off the demo's Groq quota** (Wed 11 Nov)
Why: the free tier has a 200,000 tokens/day limit (~50–100 verifications), and today's testing used it all. Eval
scripts use `GROQ_API_KEY_EVAL` when it is set; the website and the demo video should run on a key evals never touch.
The LLM client now says which limit was hit (per-minute or daily) without passing on Groq's raw message.

**AI-21 — Report the F6 eval with its original labels; explain, don't relabel or re-tune** (Wed 11 Nov)
Why: after the run, a visual check showed that none of the 7 `natural_drop` "should accept" pairs has a clean after
photo (5 end on a frame that still holds 2 labelled items; 2 are a camera pan with litter the dataset never labelled),
so the LLM's rejections there are correct. And the LLM was fooled by 5 of 12 digitally erased photos (the count check
caught 2). Relabelling or changing the prompt after seeing test results would flatter the numbers, so the headline
rates keep the pre-run labels and both findings are written next to them. Cost: the false-reject rate for real
cleanups is not measurable from public data (needs real before/after photos), and the edited-photo weakness ships;
the mitigation is product-side (in-app camera capture only, no gallery uploads), not a prompt tweak.
