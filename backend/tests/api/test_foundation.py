from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import update

from app.api.dependencies import admin_user, identity_service
from app.main import create_app
from app.models import User


def test_health(client):
    assert client.get("/health/live").json() == {"data": {"status": "alive"}}
    assert client.get("/health/ready").json() == {"data": {"status": "ready"}}


def test_readiness_failure_does_not_leak_database_details(client, app, monkeypatch):
    def fail():
        raise RuntimeError("password=private-database-value")

    monkeypatch.setattr(app.state.container.health, "_uow_factory", fail)
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_UNAVAILABLE"
    assert "private" not in response.text
    assert client.get("/health/live").status_code == 200


def test_framework_errors_are_normalized(client):
    response = client.get("/api/v1/elections")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "ROUTE_NOT_FOUND"
    response = client.delete("/api/v1/auth/me")
    assert response.status_code == 405
    assert "GET" in response.headers["allow"]
    assert response.json()["error"]["code"] == "METHOD_NOT_ALLOWED"


def test_internal_errors_are_redacted(client, app, caplog):
    def fail():
        raise RuntimeError("password=private-jwt-token SELECT private")

    app.dependency_overrides[identity_service] = fail
    response = client.post(
        "/api/v1/auth/login", json={"username": "voter", "password": "Password123"}
    )
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert response.headers["cache-control"] == "no-store"
    assert "private" not in response.text + caplog.text
    assert "Password123" not in caplog.text


def test_malformed_json_and_unknown_key_are_redacted(client):
    response = client.post(
        "/api/v1/auth/login",
        content='{"secret-value":',
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert "secret-value" not in response.text
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "voter", "password": "Password123", "secret-value": True},
    )
    assert response.status_code == 422
    assert "secret-value" not in response.text


def test_json_media_type_is_required(client):
    assert client.post("/api/v1/auth/login", content="{}").status_code == 422
    assert client.post("/api/v1/auth/login", data={"username": "voter"}).status_code == 422


def test_cors_is_explicit(client):
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization",
    }
    response = client.options("/api/v1/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    response = client.options("/api/v1/auth/me", headers=headers | {"Origin": "https://evil.test"})
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_openapi_documents_only_implemented_operations(client):
    schema = client.get("/openapi.json").json()
    assert set(schema["paths"]) == {
        "/api/v1/auth/login",
        "/api/v1/auth/me",
        "/api/v1/elections/{election_id}/voters",
        "/api/v1/elections/{election_id}/voters/{user_id}",
        "/health/live",
        "/health/ready",
    }
    assert schema["paths"]["/api/v1/auth/me"]["get"]["security"] == [{"HTTPBearer": []}]
    errors = schema["paths"]["/api/v1/auth/login"]["post"]["responses"]
    assert errors["422"]["content"]["application/json"]["schema"]["$ref"].endswith("ErrorResponse")


def test_production_docs_disabled(settings, engine):
    with TestClient(
        create_app(settings=settings.model_copy(update={"app_env": "production"}), engine=engine)
    ) as client:
        assert client.get("/docs").status_code == 404
        assert client.get("/openapi.json").status_code == 404


def test_roles_are_checked_against_database(app, engine):
    @app.get("/test-admin", dependencies=[Depends(admin_user)])
    def restricted():
        return {"ok": True}

    with TestClient(app) as client:
        token = client.post(
            "/api/v1/auth/login", json={"username": "voter", "password": "Password123"}
        ).json()["data"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/test-admin", headers=headers).status_code == 403
        with engine.begin() as connection:
            connection.execute(update(User).where(User.id == 21).values(role="ADMIN"))
        assert client.get("/test-admin", headers=headers).status_code == 200
        with engine.begin() as connection:
            connection.execute(update(User).where(User.id == 21).values(role="USER"))
        assert client.get("/test-admin", headers=headers).status_code == 403


def test_internal_error_is_not_reraised_to_asgi_server(app):
    def fail():
        raise RuntimeError("private-database-parameters")

    app.dependency_overrides[identity_service] = fail
    # raise_server_exceptions=True models the server boundary, not just HTTP output.
    with TestClient(app, raise_server_exceptions=True) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "voter", "password": "Password123"},
            headers={"Origin": "http://localhost:5173"},
        )
        assert response.status_code == 500
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
        assert "private" not in response.text
