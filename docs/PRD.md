# RiverMind — PRD (PayPal AI Hackathon, Nov 2026)

**RiverMind gives a river its own AI agent and PayPal wallet. It spots pollution, posts cleanup bounties, verifies the work with AI, and pays the person who did it.**

## Problem and user
Rivers like the Yamuna in Delhi carry visible plastic, foam and sewage. Nobody is paid to clean a specific stretch at a specific moment, and donors can't see whether their money did anything.

- **Cleanup worker:** a local waste picker, student volunteer or resident who will clean a spot for a fair, fast payment.
- **Donor / council member:** a resident, NGO or company that funds the river and wants proof that every dollar paid for real cleanup.

## Primary journey
1. A camera frame (from the camera node) or a sensor reading (from the ESP32 node or the simulator) arrives for one river point.
2. The AI detects floating waste or a water-quality spike and opens a pollution event.
3. The river's agent proposes a bounty (title, amount, reason). Backend code enforces the budget rules.
4. A worker claims the bounty and uploads before/after photos taken in the app, with browser location and time.
5. The AI scores the cleanup: scene match, waste count drop, duplicate-photo check and a vision-LLM vote. The backend policy decides.
6. The backend pays the worker through PayPal Payouts (sandbox). Payouts above $20 wait for one-tap council approval.
7. The public dashboard updates: river health, bounties, payout ledger, donations (PayPal checkout) and the river's diary.

**Wow moment:** someone dirties a glass tank of water on camera. Within seconds the river posts a bounty. A teammate cleans the tank, the AI verifies it, and the PayPal sandbox payout appears live. Then a reused photo is submitted and the AI rejects it, showing why.

## Requirements (Devpost, paraphrased — exact wording goes in PROJECT.md)
| ID | Requirement | MUST/SHOULD | Covered by |
|---|---|---|---|
| R1 | Integrate the PayPal developer platform (sandbox) with an AI tool, model or platform. PayPal must be central (judging stage 1 is pass/fail on this). | MUST | F6, F7, F8, F14 |
| R2 | Meaningfully use at least one PayPal technology, API, SDK, product or capability | MUST | F7, F8 |
| R3 | Meaningfully incorporate AI | MUST | F2, F3, F4, F6 |
| R4 | Working prototype; mockups and static or non-functional demos do not qualify | MUST | All P0 on the live URL |
| R5 | Public repo with source and an open-source licence visible in the About section | MUST | P1 S0 |
| R6 | Demo video under 3 minutes, public on YouTube | MUST | P1 S5 |
| R7 | Hosted URL or run instructions, plus a list of AI tools/models used | MUST | P1 S3–S5 |
| R8 | Project significantly built during the hackathon period; English; free access for judges | MUST | Repo history from today |

## Features
| ID | Feature | Priority | Owner | Acceptance check |
|---|---|---|---|---|
| F1 | Sensor ingest from the ESP32 (or a labelled simulator), with a live chart | P0 | P1 device, P3 API, P4 UI | A reading posted with the device token appears on the dashboard within 5 s |
| F2 | Waste detection on camera frames and uploaded images: counts by class plus boxes | P0 | P2 | The demo frame shows counts and boxes within 30 s |
| F3 | Sensor anomaly detection opens a pollution event | P0 | P2, P3 | A turbidity spike from the simulator opens an event with a reason |
| F4 | The agent proposes a bounty with an amount and reason; caps are enforced in code | P0 | P2 proposal, P3 enforcement | The amount stays within [MIN, MAX]; a request above the available treasury returns BUDGET_EXCEEDED |
| F5 | A worker claims a bounty and uploads before/after photos with browser location | P0 | P3, P4 | Claiming and uploading 2 photos moves the bounty to PROOF_SUBMITTED |
| F6 | AI cleanup verification with a result for each check | P0 | P2 scores, P3 policy | A 20-pair eval reports the false-accept rate; a reused photo is rejected as a duplicate |
| F7 | PayPal Payout on verification, council approval above $20, no double payment | P0 | P3 | A verified bounty produces exactly one sandbox payout that reaches SUCCESS, even if approve is sent twice |
| F8 | Donations through PayPal checkout raise the treasury | P0 | P3, P4 | A sandbox donation shows in the ledger and treasury within 10 s |
| F9 | Public dashboard: health score, events, bounties, ledger, treasury | P0 | P4 | Opens with seeded Yamuna data; every number traces to an API field |
| F10 | River diary: the AI writes a first-person note from real stats | P1 | P2, P3, P4 | The diary cites only numbers present in its inputs |
| F11 | PayPal webhooks (signature-verified) keep payout status in sync | P1 | P3 | A payout's status updates from the webhook |
| F12 | Hindi toggle on the worker claim page | P1 | P4 | Claim and proof are fully usable in Hindi |
| F13 | Satellite before/after tile for the river point | P2 | P2 | A Sentinel-2 tile is shown with its date |
| F14 | Agent fundraising: the river agent drafts and sends a sponsorship invoice through the PayPal Agent Toolkit | P1 | P2 draft, P3 send | The council triggers it and a sandbox invoice is sent, capped by MAX_INVOICE_CENTS |

**Non-goals:** real money, integration with government systems, training a large model from scratch, native mobile apps, full user accounts. Workers give a name and a PayPal sandbox email; the council uses one key from env.

## Success metrics we will report (real numbers only)
- Detector mAP@0.5 on a held-out split and on our own frames, against the zero-shot baseline
- Count error on 3 recorded clips compared with a manual count
- Verification accuracy and false-accept rate on 20 before/after pairs, including 5 deliberate fakes
- Time from proof upload to payout created (target: under 30 s)
- Zero double payouts in the idempotency test

## How the demo maps to the judging criteria (5 equal criteria)
| Criterion | Where judges see it |
|---|---|
| Technological implementation | PayPal sits at the centre of the journey: checkout for donations, Payouts to workers, webhooks, and Agent Toolkit invoices for the agent's own fundraising. Spending rules are enforced in code, and the CV model's accuracy is measured. |
| Design | One complete journey from pollution to payout, a polished dashboard, and a worker page that works on a phone |
| Potential impact | Paid, verified cleanup work for informal workers; donors see exactly what their money did. We state plainly that PayPal has no domestic INR payments, so a real India rollout needs a local payout partner behind the same adapter. |
| Innovation | The river itself is the economic actor: it senses, decides, verifies and pays |
| Presentation | The 3-minute video shows the whole journey live, including the fake-photo rejection |
