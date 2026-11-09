#!/usr/bin/env bash
# Starts backend (mock mode) on :8000 and frontend on :3000. Ctrl+C stops both.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "No .env — run: cp .env.example .env"; exit 1; }
set -a; source .env; set +a
export USE_MOCK_AI="${USE_MOCK_AI:-true}" PAYPAL_MODE="${PAYPAL_MODE:-mock}"
pids=()
cleanup() { for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

if [ -f backend/app/main.py ]; then
  ( cd backend
    if [ -f alembic.ini ]; then alembic upgrade head; fi
    uvicorn app.main:app --reload --port 8000 ) &
  pids+=($!)
else
  echo "backend not scaffolded yet (P3 S0) — skipping"
fi

if [ -f frontend/package.json ]; then
  ( cd frontend && npm run dev -- --port 3000 ) &
  pids+=($!)
else
  echo "frontend not scaffolded yet (P4 S0) — skipping"
fi

if [ ${#pids[@]} -eq 0 ]; then echo "Nothing to run yet."; exit 0; fi
wait
