# RiverMind — PROJECT.md   (updated Mon 9 Nov 2026, IST, by the Coordinator; Dhruv maintains it from Sync 0)

## Brief
- User: cleanup workers (waste pickers, student volunteers, residents) and the donors/council who fund a river.
- Pain: nobody is paid to clean a specific stretch at a specific moment, and donors cannot see what their money did.
- Value: RiverMind gives a river (demo: the Yamuna, Delhi) its own AI agent and PayPal wallet. It spots pollution, posts cleanup bounties, verifies the cleanup with AI, and pays the person who did it.
- Primary journey:
  1. Camera frame or sensor reading arrives.
  2. AI detects waste or a water-quality spike.
  3. The agent proposes a bounty and code enforces the budget.
  4. A worker claims it and uploads before/after photos.
  5. AI scores the cleanup and backend policy decides.
  6. PayPal Payout goes to the worker (council approval above $20).
  7. The dashboard updates.
- Wow moment: dirty a glass tank on camera. The river posts a bounty, a teammate cleans the tank, AI verifies it, and the PayPal sandbox payout appears live. Then a reused photo gets rejected, with the reason shown.
- Event: PayPal AI Hackathon (Devpost). Official deadline Thu 12 Nov 2026, 12:00 PST = Fri 13 Nov, 01:30 IST. **Our deadline: Thu 12 Nov, 22:00 IST.**

## Requirements
Dhruv: replace the paraphrases below with the exact wording from https://paypalaihackathon.devpost.com/rules in S0.2.

| ID | Wording (paraphrased) | MUST/SHOULD | Covered by |
|---|---|---|---|
| R1 | Integrate the PayPal developer platform (sandbox) with an AI tool/model; PayPal integration central | MUST | F6, F7, F8, F14 |
| R2 | Meaningful use of at least one PayPal API, SDK, product or capability | MUST | F7, F8 |
| R3 | Meaningfully incorporate AI | MUST | F2, F3, F4, F6 |
| R4 | Working prototype; no mockups or static demos | MUST | all P0 live |
| R5 | Public repo, open-source licence visible in the About section | MUST | P1 S0.1 |
| R6 | Demo video under 3 minutes, public on YouTube | MUST | P1 S5.3 |
| R7 | Hosted URL or setup instructions; list of AI tools used | MUST | P1 S3.4, S5.4 |
| R8 | Project significantly built during the submission period; English; free judge access | MUST | repo history |

## Features
| ID | Feature | P | Owner | Acceptance check |
|---|---|---|---|---|
| F1 | Sensor ingest + live chart | P0 | P1, P3, P4 | Reading appears on the dashboard within 5 s; simulated readings labelled |
| F2 | Waste detection on images | P0 | P2 | Demo frame → counts + boxes within 30 s |
| F3 | Sensor anomaly → event | P0 | P2, P3 | Injected turbidity spike → SENSOR_ANOMALY event with a reason |
| F4 | Agent bounty + code-enforced caps | P0 | P2, P3 | Bounty amount within [MIN, MAX]; over budget → BUDGET_EXCEEDED |
| F5 | Claim + before/after proof | P0 | P3, P4 | Claim + 2 photos → PROOF_SUBMITTED |
| F6 | AI cleanup verification | P0 | P2, P3 | 20-pair eval with false-accept rate reported; reused photo → REJECTED (duplicate) |
| F7 | PayPal Payout + council approval + no double pay | P0 | P3 | Verified bounty → exactly one sandbox payout reaching SUCCESS, even if approve is sent twice |
| F8 | PayPal donations | P0 | P3, P4 | Sandbox donation shows in ledger and treasury within 10 s |
| F9 | Public dashboard | P0 | P4 | Opens with seeded Yamuna data; every number from the API |
| F10 | River diary | P1 | P2, P3, P4 | Diary uses only numbers present in its inputs |
| F11 | Signature-verified webhooks | P1 | P3 | Payout status updated from the webhook |
| F12 | Hindi toggle on claim page | P1 | P4 | Claim + proof fully usable in Hindi |
| F13 | Satellite tile | P2 | P2 | — |
| F14 | Agent fundraising invoice via PayPal Agent Toolkit | P1 | P2, P3 | Council triggers it; sandbox invoice sent, capped by MAX_INVOICE_CENTS |

## Architecture
- Components:
  - ESP32 sensor node or simulator, and the camera node script → FastAPI backend (Render).
  - The backend imports the `rivermind_ai` package from `ai/` (mock or real), uses Postgres (Neon; SQLite locally), and calls `paypal_client` → PayPal sandbox (Orders v2, Payouts, Webhooks, Agent Toolkit invoices).
  - Next.js frontend (Vercel) with the PayPal JS SDK buttons.
- The AI returns proposals and scores; plain backend code decides every amount and every payment.
- Stack: Python 3.11 FastAPI + SQLAlchemy + Alembic; Next.js + TS + Tailwind + shadcn/ui; ESP32 Arduino.
- Hosting: Vercel + Render + Neon.
- AI: vision LLM (Claude API or Gemini, via `LLM_PROVIDER`) + YOLO detector (ONNX), with YOLO-World zero-shot as the baseline/fallback. The LLM handles flexible judgement; YOLO gives fast, countable boxes.
- DB: Postgres, because payouts, donations and the ledger must survive restarts.

## Team
| Person | Role | Folders | Branch |
|---|---|---|---|
| P1 Dhruv (Claude Code) | Integration lead, DevOps, QA, IoT, Pitch, Security sign-off | root, docs/, fixtures/, scripts/, firmware/, e2e/, .github/ | feat/int-dhruv |
| P2 (Claude Code) | AI/Core, CV, eval | ai/, eval/ | feat/ai-core |
| P3 (Claude Code) | Backend, DB, PayPal, security | backend/ | feat/be-api |
| P4 (Codex) | Frontend | frontend/ | feat/fe-app |

## Timeline (IST)
| Stage | Window | Sync |
|---|---|---|
| S0 Setup & Contract | Mon 16:00–19:30 | Sync 0 Mon 19:30 (PayPal spike must pass) |
| S1 Walking Skeleton | Mon 19:30–Tue 13:00 | Sync 1 Tue 13:00 |
| S2 First Real Slice | Tue 13:00–Wed 11:00 | Sync 2 Wed 11:00 |
| S3 Complete P0 | Wed 11:00–23:00 | Sync 3 Wed 23:00 |
| S4 Harden, Secure, Polish | Thu 08:00–15:00 | Sync 4 FREEZE Thu 15:00 |
| S5 Demo & Submit | Thu 15:00–22:00 | Final Thu 22:00 |

## Status   (Dhruv updates at every sync)
main: Stage 0 skeleton (Coordinator)   Last sync passed: —
Works for real: —   Still mocked: everything   Known bugs/limits: —
Next: everyone S0.

## Decisions and assumptions
- A1: P1 Dhruv; P2–P4 put their own names in their prompt headers.
- A2: P4 uses Codex; P1–P3 use Claude Code.
- A3: everyone works about 07:30–01:00 IST.
- A4: Dhruv is the Integration lead and the presenter.
- A5: each AI teammate has a vision-capable LLM API key.
- A6: everyone has PayPal Developer accounts.
- A7: ESP32 is available; sensors are optional (simulator, labelled).
- A8: Yamuna is the demo river.
- A9: USD sandbox.
- D1: Postgres (Neon) when deployed, because Render's free disk is wiped on restart. — Mon 9 Nov
- D2: Payouts via REST, since the PayPal Agent Toolkit has no payouts tool. The Toolkit is used for agent fundraising invoices (F14). — Mon 9 Nov
- D3: location comes from the browser at capture time, not EXIF, because phones and messengers strip EXIF. Sensor data is context, not proof of cleanup. — Mon 9 Nov
- D4: fallback if sandbox Payouts is blocked: bounty escrow with Orders `intent=AUTHORIZE`. Authorize on funding, capture on verified cleanup, void on rejection. — Mon 9 Nov
- D5: honest impact framing. PayPal has no domestic INR payments, so a real India rollout needs a local payout partner behind the same adapter. — Mon 9 Nov

## Cut list (in order)
1. F13 satellite
2. F12 Hindi
3. F14 fundraise invoice
4. Real ESP32 node (use the simulator, labelled)
5. F11 webhooks (keep polling)
6. F10 diary (template only)
7. Fine-tuned detector (ship YOLO-World zero-shot or the LLM path)
8. Simplify the dashboard to status + bounties + ledger

Never cut: payouts, donations, verification with the duplicate check, budget caps, the video.
