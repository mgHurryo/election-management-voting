"""M1 authorization baseline (FR-05 / FR-06).

Covers the three checks that must stay independent: authentication (401),
role (403) and resource visibility (404, verified in the owning module once
M2/M3/M7 endpoints exist). The ADMIN-only probe below exists only because the
production app currently ships no admin endpoint.
"""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.api.dependencies import AdminUser
from app.main import create_app
from app.models import User

ALGORITHM = "HS256"
MAX_ID_AS_STRING = "18446744073709551615"
LOGIN = "/api/v1/auth/login"
ME = "/api/v1/auth/me"

probe_router = APIRouter(prefix="/api/v1/test-only")


@probe_router.get("/admin")
def admin_only_probe(user: AdminUser):
    """ADMIN-only probe: mirrors how every future admin endpoint declares access."""
    return {"data": {"role": user.role}}


@pytest.fixture
def admin_probe_app(settings, engine):
    app = create_app(settings=settings, engine=engine)
    app.include_router(probe_router)
    return app


def login(client, username="voter", password="Password123"):
    return client.post(LOGIN, json={"username": username, "password": password})


def token_for(client, username="voter"):
    response = login(client, username=username)
    assert response.status_code == 200
    return response.json()["data"]["access_token"]


def test_missing_identity_returns_401_with_challenge(client):
    response = client.get(ME)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


@pytest.mark.parametrize(
    "kind", ["wrong_secret", "missing_exp", "non_numeric_sub", "subject_beyond_bigint", "expired"]
)
def test_forged_or_expired_token_is_rejected(settings, client, kind):
    now = datetime.now(UTC).replace(microsecond=0)
    claims = {"sub": "21", "iat": now, "exp": now + timedelta(minutes=5)}
    signer = settings.jwt_secret.get_secret_value()

    if kind == "wrong_secret":
        signer = "a-different-secret-that-is-long-enough-1234567890"
    elif kind == "missing_exp":
        claims.pop("exp")
    elif kind == "non_numeric_sub":
        claims["sub"] = "21 OR 1=1"
    elif kind == "subject_beyond_bigint":
        claims["sub"] = str(int(MAX_ID_AS_STRING) + 1)
    else:
        claims["exp"] = now - timedelta(seconds=1)

    token = jwt.encode(claims, signer, algorithm=ALGORITHM)
    response = client.get(ME, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


def test_token_of_removed_account_is_rejected(client, engine):
    token = token_for(client)
    with engine.begin() as connection:
        connection.execute(delete(User).where(User.id == 21))

    response = client.get(ME, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


def test_admin_only_route_requires_authentication(admin_probe_app):
    with TestClient(admin_probe_app, raise_server_exceptions=False) as client:
        response = client.get("/api/v1/test-only/admin")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


def test_user_token_is_rejected_on_admin_only_route(admin_probe_app):
    with TestClient(admin_probe_app, raise_server_exceptions=False) as client:
        token = token_for(client, username="voter")
        response = client.get(
            "/api/v1/test-only/admin", headers={"Authorization": f"Bearer {token}"}
        )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PERMISSION_DENIED"
    assert "voter" not in response.text


def test_admin_token_passes_admin_only_route(admin_probe_app):
    with TestClient(admin_probe_app, raise_server_exceptions=False) as client:
        token = token_for(client, username="admin")
        response = client.get(
            "/api/v1/test-only/admin", headers={"Authorization": f"Bearer {token}"}
        )

    assert response.status_code == 200
    assert response.json() == {"data": {"role": "ADMIN"}}


@pytest.mark.parametrize(
    "password",
    [
        "A1" * 36,  # 72 bytes: exactly at the bcrypt input limit
        "A1" * 37,  # 74 bytes: past the bcrypt limit, must fail instead of truncating
        "密" * 24 + "a1",  # multibyte input past the limit: 74 bytes, 26 characters
        "x1",  # too short for the policy, still a login attempt
    ],
)
def test_login_password_boundaries_return_generic_failure(client, password):
    response = login(client, "voter", password)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"
    assert password not in response.text


def test_unknown_route_reports_not_found(client):
    response = client.get("/api/v1/not-a-real-operation")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "ROUTE_NOT_FOUND"
