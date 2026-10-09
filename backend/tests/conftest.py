from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.bootstrap.config import Settings
from app.infrastructure.persistence.orm import User
from app.infrastructure.security import hash_password
from app.main import create_app


@pytest.fixture
def settings():
    return Settings(
        _env_file=None,
        app_env="test",
        db_host="localhost",
        db_name="test_only",
        db_user="test_app",
        db_password="test-only-database-password",
        jwt_secret="test-only-jwt-secret-not-for-deployment-123456789",
        frontend_origin="http://localhost:5173",
    )


@pytest.fixture(scope="session")
def password_hash():
    return hash_password("Password123")


@pytest.fixture
def engine(password_hash):
    # SQLite is only a fast identity adapter; it does not verify MySQL locks/schema.
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    User.__table__.create(engine)
    now = datetime(2026, 10, 1, 0, 0, 0, tzinfo=UTC).replace(tzinfo=None)
    with engine.begin() as connection:
        connection.execute(
            User.__table__.insert(),
            [
                dict(
                    id=21,
                    username="voter",
                    password_hash=password_hash,
                    display_name="Voter",
                    role="USER",
                    status="ACTIVE",
                    created_at=now,
                    updated_at=now,
                ),
                dict(
                    id=22,
                    username="admin",
                    password_hash=password_hash,
                    display_name="Admin",
                    role="ADMIN",
                    status="ACTIVE",
                    created_at=now,
                    updated_at=now,
                ),
            ],
        )
    yield engine
    engine.dispose()


@pytest.fixture
def app(settings, engine):
    return create_app(settings=settings, engine=engine)


@pytest.fixture
def client(app):
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client
