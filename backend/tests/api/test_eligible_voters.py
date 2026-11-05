from datetime import UTC, datetime

from sqlalchemy import insert

from app.models import User


def token(client, username):
    response = client.post(
        "/api/v1/auth/login", json={"username": username, "password": "Password123"}
    )
    assert response.status_code == 200
    return response.json()["data"]["access_token"]


def test_eligible_voters_requires_admin(client):
    path = "/api/v1/users/eligible-voters"
    assert client.get(path).status_code == 401
    user_token = token(client, "voter")
    response = client.get(path, headers={"Authorization": f"Bearer {user_token}"})
    assert response.status_code == 403


def test_eligible_voters_returns_active_users_with_pagination_and_minimal_fields(
    client, engine, password_hash
):
    now = datetime(2026, 10, 1, 0, 0, 0, tzinfo=UTC).replace(tzinfo=None)
    with engine.begin() as connection:
        connection.execute(
            insert(User),
            [
                {
                    "id": 23,
                    "username": "inactive-voter",
                    "password_hash": password_hash,
                    "display_name": "Inactive Voter",
                    "role": "USER",
                    "status": "DISABLED",
                    "created_at": now,
                    "updated_at": now,
                },
                {
                    "id": 24,
                    "username": "second-voter",
                    "password_hash": password_hash,
                    "display_name": "Second Voter",
                    "role": "USER",
                    "status": "ACTIVE",
                    "created_at": now,
                    "updated_at": now,
                },
                {
                    "id": 25,
                    "username": "active-admin",
                    "password_hash": password_hash,
                    "display_name": "Another Admin",
                    "role": "ADMIN",
                    "status": "ACTIVE",
                    "created_at": now,
                    "updated_at": now,
                },
            ],
        )
    admin_token = token(client, "admin")
    headers = {"Authorization": f"Bearer {admin_token}"}

    first = client.get("/api/v1/users/eligible-voters?page=1&page_size=1", headers=headers)
    second = client.get("/api/v1/users/eligible-voters?page=2&page_size=1", headers=headers)

    assert first.status_code == second.status_code == 200
    assert first.json() == {
        "data": [{"user_id": "21", "display_name": "Voter"}],
        "meta": {"page": 1, "page_size": 1, "total": 2},
    }
    assert second.json()["data"] == [{"user_id": "24", "display_name": "Second Voter"}]
    assert set(first.json()["data"][0]) == {"user_id", "display_name"}
