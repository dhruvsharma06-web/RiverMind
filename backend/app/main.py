from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.errors import install_error_handlers
from app.observability import RequestLogMiddleware, setup_logging
from app.routes import health


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging()
    app = FastAPI(title="RiverMind API", version="1.0")
    install_error_handlers(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Authorization", "Idempotency-Key", "X-Claim-Token", "X-Device-Token"],
        allow_credentials=False,
    )
    app.add_middleware(RequestLogMiddleware)  # added last = outermost, so it sees every response
    app.include_router(health.router)
    return app


app = create_app()
