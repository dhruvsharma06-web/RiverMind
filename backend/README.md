# RiverMind backend

FastAPI + SQLAlchemy + Alembic. It owns the database, the bounty state machine, the budget, verification
decisions and every PayPal call. `CONTRACT.md` at the repo root is the source of truth for every endpoint and object.

## Setup (Python 3.11)

```bash
cd backend
uv venv --python 3.11 .venv            # or: python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install --no-deps -r requirements-toolkit.txt   # F14 invoices; see note below
cp ../.env.example ../.env             # then fill in values (never commit .env)
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

**Why `--no-deps` for the toolkit:** `paypal-agent-toolkit` declares langchain, crewai and other agent frameworks
as dependencies, and those carry 100+ known CVEs. We only use its core invoice tools, which need pydantic, httpx and
requests (already in `requirements.txt`). Without the toolkit installed, everything still runs:
`POST /agent/fundraise` returns `PAYPAL_ERROR`, and the 2 toolkit tests are skipped.

## Environment variables

Read from `../.env`, then `.env`, then the environment. Empty values count as unset.

| Name | Purpose |
|---|---|
| `DATABASE_URL` | `sqlite:///./rivermind.db` locally; Neon `postgresql://...` in production (driver is added automatically) |
| `USE_MOCK_AI` | `true` uses the mock AI |
| `PAYPAL_MODE` | `mock` (no network, ids start with `MOCK-`) or `sandbox` |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Sandbox REST app credentials. Required when `PAYPAL_MODE=sandbox` |
| `PAYPAL_WEBHOOK_ID` | Id of the webhook registered in the sandbox app. Without it every webhook is rejected |
| `PAYPAL_SANDBOX_RECEIVER` | Sandbox Personal account email (spike script and demo claims) |
| `COUNCIL_API_KEY` | Bearer key for council actions and `/demo/reset` |
| `CORS_ORIGINS` | Comma-separated exact origins. `*` is refused |
| `DEVICE_ID`, `DEVICE_TOKEN` | The sensor device and its `X-Device-Token` |
| `CAMERA_LAT`, `CAMERA_LON` | Fixed camera location. Set both or neither |
| `MIN_BOUNTY_CENTS`, `MAX_BOUNTY_CENTS` | Bounty amount range |
| `DAILY_CAP_CENTS` | Max new reserves per UTC day |
| `SEED_TREASURY_CENTS` | Starting treasury after `/demo/reset` |
| `COUNCIL_THRESHOLD_CENTS` | Payouts above this wait for council approval |
| `MAX_INVOICE_CENTS` | Cap on one fundraising invoice |

All money is integer cents. Conversion to PayPal's `"12.50"` strings happens only in `app/adapters/paypal_client.py`.

## Endpoints (all under `/api/v1`)

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | none |
| POST | `/readings` | `X-Device-Token` |
| GET | `/readings`, `/events`, `/media/{media_id}` | none |
| POST | `/media/analyze` | none (20/min per IP) |
| GET | `/bounties`, `/bounties/{bounty_id}` | none |
| POST | `/bounties/{bounty_id}/claim` | none; returns the claim token once |
| POST | `/bounties/{bounty_id}/proof` | `X-Claim-Token` |
| GET | `/payouts` | none (emails masked) |
| POST | `/payouts/{payout_id}/approve`, `/veto`, `/retry` | `Authorization: Bearer <COUNCIL_API_KEY>`; `Idempotency-Key` on approve/retry |
| POST | `/donations/orders` | `Idempotency-Key` |
| POST | `/donations/orders/{order_id}/capture` | none |
| GET | `/donations` | none |
| POST | `/webhooks/paypal` | PayPal signature, verified with PayPal |
| POST | `/agent/fundraise` | council key |
| GET | `/river/status`, `/diary/latest` | none |
| POST | `/demo/reset` | council key; wipes and reseeds the database |

Errors always look like `{"error": {"code", "message", "details"}}`.
Limits: JSON bodies 64 KB, uploads about 16 MB, per-IP rate limits on media, claim, proof, donations and council routes.

## Tests

```bash
cd backend
.venv/bin/ruff check .
.venv/bin/pytest -q
```

Tests use a temporary SQLite database, mock PayPal and a fake PayPal HTTP server. No network or credentials needed.

## PayPal sandbox setup

1. https://developer.paypal.com → **Sandbox accounts**: use (or create) one US **Business** and one US **Personal** account.
2. **Apps & Credentials** (Sandbox) → create a REST app linked to the Business account. Copy Client ID and Secret into
   `.env` as `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`. Make sure **Payouts** and **Invoicing** are enabled in the app's features.
3. Put the Personal account's email in `PAYPAL_SANDBOX_RECEIVER`.
4. Prove it works (from `backend/`): `.venv/bin/python scripts/paypal_spike.py`. It creates an order (open the printed
   link, pay with the Personal account), captures it, sends a $1.00 payout and polls until `SUCCESS`.
   `--skip-order` tests only Payouts. The script never prints secrets.
5. After the backend is deployed: in the app, **Add Webhook** with URL `https://<backend>/api/v1/webhooks/paypal` and events
   `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `.FAILED`, `.BLOCKED`, `.RETURNED`, `.UNCLAIMED`.
   Copy the webhook id into `PAYPAL_WEBHOOK_ID`.
6. Set `PAYPAL_MODE=sandbox` and restart.

Webhooks are a backup: payouts are also polled after sending, and stale ones are re-polled when bounties or payouts are read.

## Deploy (Render + Neon)

- Build: `pip install -r backend/requirements.txt && pip install --no-deps -r backend/requirements-toolkit.txt`
- Start: `cd backend && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*'`
  (the proxy flags let rate limits see the real client IP and turn on HSTS behind TLS)
- Set the environment variables above in Render. `DATABASE_URL` is the Neon connection string.
- Run one instance: the rate limiter and the daily AI call cap are kept in memory per process.

## Before a demo

1. Wake the service: `curl https://<backend>/api/v1/health` (free Render instances sleep).
2. Reset: `curl -X POST -H "Authorization: Bearer $COUNCIL_API_KEY" https://<backend>/api/v1/demo/reset`
