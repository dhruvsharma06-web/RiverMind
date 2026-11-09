.PHONY: install dev test types smoke
# Every target must work even while a folder is still empty (skeleton stage).

install:
	@if [ -f ai/pyproject.toml ]; then pip install -e "ai[real]"; else echo "skip ai: not scaffolded yet"; fi
	@if [ -f backend/requirements.txt ]; then pip install -r backend/requirements.txt; else echo "skip backend: not scaffolded yet"; fi
	@if [ -f frontend/package.json ]; then npm --prefix frontend install; else echo "skip frontend: not scaffolded yet"; fi
	@pip install -q pytest ruff

dev:
	@bash scripts/dev.sh

test:
	@ruff check $$(ls -d ai backend scripts e2e 2>/dev/null)
	@for d in e2e ai backend; do if [ -d $$d/tests ] || ls $$d/test_*.py >/dev/null 2>&1; then (cd $$d && python -m pytest -q) || exit 1; fi; done
	@if [ -f frontend/package.json ]; then npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test --if-present; fi

types:
	@if [ -f backend/app/main.py ] && [ -f frontend/package.json ]; then \
	  cd backend && python -c "import json;from app.main import app;print(json.dumps(app.openapi(),sort_keys=True,indent=2))" > ../frontend/openapi.json && cd .. && \
	  npm --prefix frontend run gen:types; \
	else echo "skip types: backend/app/main.py or frontend/package.json not there yet"; fi

smoke:
	@if [ -f scripts/e2e_smoke.py ]; then python scripts/e2e_smoke.py; else echo "skip smoke: scripts/e2e_smoke.py arrives in P1 S1.3"; fi
