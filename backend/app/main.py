import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Engine

from app.api.errors import register_error_handlers
from app.api.health import router as health_router
from app.api.middleware import NoStoreMiddleware, SanitizedErrorMiddleware
from app.api.router import router as api_router
from app.core.config import Settings
from app.core.container import Container
from app.services.window import run_window_transitions


def create_app(*, settings: Settings | None = None, engine: Engine | None = None) -> FastAPI:
    settings = settings if settings is not None else Settings()
    logging.getLogger("app").setLevel(settings.log_level)
    container = Container(settings, engine)
    stop = asyncio.Event()

    async def window_scheduler() -> None:
        while not stop.is_set():
            try:
                await asyncio.to_thread(
                    run_window_transitions,
                    container.unit_of_work,
                    container.elections,
                )
            except Exception:  # noqa: BLE001 - one failed tick must not stop the scheduler
                logging.getLogger("app").exception("election window transition tick failed")
            with suppress(TimeoutError):
                await asyncio.wait_for(stop.wait(), timeout=settings.window_tick_seconds)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        scheduler = asyncio.create_task(window_scheduler()) if settings.window_scheduler else None
        try:
            yield
        finally:
            stop.set()
            if scheduler is not None:
                with suppress(TimeoutError):
                    await asyncio.wait_for(scheduler, timeout=10)
            container.close()

    app = FastAPI(
        title="Election Management and Voting API",
        version="0.1.0",
        description="Identity, voter roster, election and candidate management API.",
        lifespan=lifespan,
        redirect_slashes=False,
        docs_url="/docs" if settings.app_env != "production" else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.app_env != "production" else None,
    )
    app.state.container = container
    app.add_middleware(SanitizedErrorMiddleware)
    app.add_middleware(NoStoreMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    register_error_handlers(app)
    app.include_router(api_router)
    app.include_router(health_router)
    return app
