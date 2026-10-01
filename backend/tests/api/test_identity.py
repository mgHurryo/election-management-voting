import pytest
from sqlalchemy import update

from app.models import User


def login(client, username="voter", password="Password123"):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def test_login_and_me_contract(client):
    response = login(client)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 3600
    assert data["user"] == {
        "id": "21",
        "username": "voter",
        "display_name": "Voter",
        "role": "USER",
        "status": "ACTIVE",
        "created_at": "2026-10-01T00:00:00Z",
        "updated_at": "2026-10-01T00:00:00Z",
    }
    response = client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"}
    )
    assert response.status_code == 200
    assert response.json() == {"data": data["user"]}
    assert response.headers["cache-control"] == "no-store"
    assert "password" not in response.text


@pytest.mark.parametrize("username,password", [("missing", "Password123"), ("voter", "wrong")])
def test_generic_invalid_credentials(client, username, password):
    response = login(client, username, password)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_disabled_account_is_rechecked(client, engine):
    token = login(client).json()["data"]["access_token"]
    with engine.begin() as connection:
        connection.execute(update(User).where(User.id == 21).values(status="DISABLED"))
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"
    assert login(client).json()["error"]["code"] == "INVALID_CREDENTIALS"


@pytest.mark.parametrize(
    "headers", [{}, {"Authorization": "Bearer invalid"}, {"Authorization": "Basic x"}]
)
def test_missing_or_invalid_identity(client, headers):
    response = client.get("/api/v1/auth/me", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "body",
    [
        {"username": "voter", "password": "Password123", "role": "ADMIN"},
        {"username": 21, "password": "Password123"},
        {"username": "   ", "password": "Password123"},
        {"username": "voter", "password": ""},
    ],
)
def test_input_allowlist_and_redacted_errors(client, body):
    response = client.post("/api/v1/auth/login", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "Password123" not in response.text
    assert "input" not in response.text


def test_unknown_query_and_unexpected_body(client):
    response = client.post(
        "/api/v1/auth/login?debug=true", json={"username": "voter", "password": "Password123"}
    )
    assert response.status_code == 422
    token = login(client).json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/auth/me?debug=true", headers=headers).status_code == 422
    assert client.request("GET", "/api/v1/auth/me", headers=headers, json={}).status_code == 422
