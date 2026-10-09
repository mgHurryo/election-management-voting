import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Engine

from app.api.errors import register_error_handlers
from app.api.health import router as health_router
from app.api.middleware import NoStoreMiddleware, SanitizedErrorMiddleware
from app.api.router import router as api_router
from app.bootstrap.config import Settings
from app.bootstrap.container import Container


def create_app(*, settings: Settings | None = None, engine: Engine | None = None) -> FastAPI:
    settings = settings if settings is not None else Settings()
    logging.getLogger("app").setLevel(settings.log_level)
    container = Container(settings, engine)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            yield
        finally:
            container.close()

    app = FastAPI(
        title="Election Management and Voting API",
        version="0.1.0",
        description="Backend foundation. Only identity and operational health are implemented.",
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
