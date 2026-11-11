# RiverMind 🌊

**A river with its own AI agent and PayPal wallet.** RiverMind watches a river (demo: the Yamuna, Delhi) through a camera and a water-quality sensor. When it spots pollution, it posts a cleanup bounty. It verifies the cleanup with AI and pays the person who did it through PayPal Payouts.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) (Nov 2026).

> Status: under construction. Live links, a screenshot and real evaluation numbers will be added as they become real.

## How it works
1. A camera frame or a sensor reading arrives from a river point.
2. AI detects floating waste or a water-quality spike.
3. The river's agent proposes a cleanup bounty. Code enforces the budget rules.
4. A worker claims the bounty and uploads before/after photos.
5. AI scores the cleanup: scene match, waste count, duplicate-photo check and a vision-LLM vote. Code decides the result.
6. The worker is paid through PayPal Payouts (sandbox). Larger payouts need council approval.
7. Donors fund the river through PayPal checkout, and everyone can see every payment on the dashboard.

## PayPal products used
- Orders v2 + JS SDK buttons (donations)
- Payouts (paying workers)
- Webhooks (payment status)
- PayPal Agent Toolkit (agent fundraising invoices; planned)

## AI used
- Vision LLM: Qwen (`qwen/qwen3.8-27b`) served by Groq, with Claude API or Gemini as backups, selected by `LLM_PROVIDER`
- YOLO11n waste detector (ONNX on CPU) fine-tuned on public, pre-labelled river-waste datasets (bottle / bag / other / vegetation), compared against YOLO-World as the zero-shot baseline. Data credits: `ai/ATTRIBUTION.md`
- IsolationForest + robust z-score for sensor anomalies

How it works: `ai/README.md` · model card: `ai/MODEL_CARD.md` · decisions: `ai/DECISIONS.md` · evaluation plan and measured results: `eval/README.md`, `eval/RESULTS.md`.

## Run locally (mock mode, no keys needed)
```bash
git clone https://github.com/dhruvsharma06-web/RiverMind && cd RiverMind
cp .env.example .env
make install
make dev        # backend http://localhost:8000/docs, frontend http://localhost:3000
make smoke      # full journey test (from Stage 1)
```

## Repo layout
| Folder | What | Owner |
|---|---|---|
| `backend/` | FastAPI API, database, PayPal client, spending rules | P3 |
| `ai/` | `rivermind_ai` package: detection, anomalies, bounty agent, verification, diary | P2 |
| `frontend/` | Next.js dashboard, worker claim page, council page, donate page | P4 |
| `firmware/` | ESP32 sensor node (not used: readings come from the labelled simulator) | P1 |
| `scripts/` | simulator, camera node, smoke test, dev helpers | P1 |
| `fixtures/` | contract example responses used by mocks and tests | P1 |
| `docs/` | PRD, Master Prompts, security notes | P1 |

Contract: `CONTRACT.md` · Plan: `PROJECT.md` · PRD: `docs/PRD.md`

## Team
Dhruv Sharma (integration, IoT, pitch) · P2 (AI/CV) · P3 (backend, PayPal) · P4 (frontend)

## Licence
MIT. See `LICENSE`. The detector weights are trained with Ultralytics YOLO (AGPL-3.0); training data credits are in `ai/ATTRIBUTION.md`.
