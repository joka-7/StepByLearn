"""FastAPI application factory, lifespan, and error translation."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from stepbylearn.api.container import build_container
from stepbylearn.config import Settings, get_settings
from stepbylearn.domain.exceptions import (
    ConfigError,
    JSONHealingError,
    NoAvailableEngineError,
    RepositoryError,
)

_WEB_DIR = Path(__file__).resolve().parent.parent / "web"


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Build the container on startup and dispose the engine on shutdown.

    Args:
        app: The FastAPI application.

    Yields:
        Control back to the running application.
    """
    settings: Settings = app.state.settings
    app.state.container = build_container(settings)
    try:
        yield
    finally:
        app.state.container.engine.dispose()


def _register_error_handlers(app: FastAPI) -> None:
    """Map domain exceptions to clean, actionable HTTP responses.

    Args:
        app: The FastAPI application.
    """

    @app.exception_handler(NoAvailableEngineError)
    async def _no_engine(_r: Request, exc: NoAvailableEngineError) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={"error": str(exc), "hints": exc.hints},
        )

    @app.exception_handler(ConfigError)
    async def _config(_r: Request, exc: ConfigError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"error": str(exc)})

    @app.exception_handler(JSONHealingError)
    async def _healing(_r: Request, exc: JSONHealingError) -> JSONResponse:
        # The raw model output is intentionally omitted from the client response
        # to keep payloads small; it remains available server-side for logs.
        return JSONResponse(
            status_code=502,
            content={
                "error": "The AI response could not be parsed.",
                "detail": str(exc),
            },
        )

    @app.exception_handler(RepositoryError)
    async def _repo(_r: Request, exc: RepositoryError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"error": str(exc)})


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create and configure the FastAPI application.

    Args:
        settings: Optional settings override (tests inject their own).

    Returns:
        The configured application, ready to serve.
    """
    app = FastAPI(title="StepByLearn", version="0.1.0", lifespan=_lifespan)
    app.state.settings = settings or get_settings()

    _register_error_handlers(app)

    # Routers are imported lazily to avoid import cycles at module load.
    from stepbylearn.api.routes import (
        calendar,
        health,
        paths,
        steps,
    )
    from stepbylearn.api.routes import (
        settings as settings_routes,
    )

    app.include_router(health.router)
    app.include_router(paths.router)
    app.include_router(steps.router)
    app.include_router(calendar.router)
    app.include_router(settings_routes.router)

    # Serve the offline UI shell when present (optional for API-only use).
    if _WEB_DIR.is_dir():
        app.mount("/", StaticFiles(directory=_WEB_DIR, html=True), name="web")

    return app
