"""Fixtures for M2 (voter roll) and M4 (ballot and voting) API tests.

This conftest shadows the repository-wide ``engine`` fixture for this
subdirectory only: the seed below creates the full election schema and
row-level test data (users, elections, roster, candidates) that the
identity-only seed in ``tests/conftest.py`` does not provide. The shared
``settings`` / ``app`` / ``client`` fixtures keep working unchanged.

The SQLite engine is a fast contract adapter; it does not verify MySQL
row locks (ADR-007). Concurrency behaviour needs the MySQL-marked tests.
"""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.models import Base

# Election ids used across the M2/M4 tests.
DRAFT_ELECTION = 1001  # DRAFT; roster mutations are allowed.
OPEN_ELECTION = 2002  # OPEN with starts_at <= now <= ends_at; voting works.
NOT_STARTED_ELECTION = 3003  # OPEN but the window has not started yet.
ENDED_ELECTION = 4004  # OPEN but the window is already over.
CLOSED_ELECTION = 5005  # CLOSED; no roster mutation, no ballot, no vote.

# User ids: 21 voter (roster member), 22 admin, 23 voter2 (member),
# 24 outsider (no membership anywhere), 25 suspended (DISABLED account).
PASSWORD = "Password123"


@pytest.fixture
def engine(password_hash):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)

    now = datetime.now(UTC).replace(microsecond=0)
    naive_now = now.replace(tzinfo=None)
    hour = timedelta(hours=1)
    created = datetime(2026, 10, 1)

    with engine.begin() as connection:
        connection.execute(
            Base.metadata.tables["users"].insert(),
            [
                dict(
                    id=21,
                    username="voter",
                    password_hash=password_hash,
                    display_name="Demo Voter",
                    role="USER",
                    status="ACTIVE",
                    created_at=created,
                    updated_at=created,
                ),
                dict(
                    id=22,
                    username="admin",
                    password_hash=password_hash,
                    display_name="Admin",
                    role="ADMIN",
                    status="ACTIVE",
                    created_at=created,
                    updated_at=created,
                ),
                dict(
                    id=23,
                    username="voter2",
                    password_hash=password_hash,
                    display_name="Demo Voter 2",
                    role="USER",
                    status="ACTIVE",
                    created_at=created,
                    updated_at=created,
                ),
                dict(
                    id=24,
                    username="outsider",
                    password_hash=password_hash,
                    display_name="Outsider",
                    role="USER",
                    status="ACTIVE",
                    created_at=created,
                    updated_at=created,
                ),
                dict(
                    id=25,
                    username="suspended",
                    password_hash=password_hash,
                    display_name="Suspended",
                    role="USER",
                    status="DISABLED",
                    created_at=created,
                    updated_at=created,
                ),
            ],
        )
        connection.execute(
            Base.metadata.tables["elections"].insert(),
            [
                dict(
                    id=DRAFT_ELECTION,
                    title="Draft Election",
                    position_title="Class President",
                    description="Still being configured.",
                    created_by=22,
                    status="DRAFT",
                    privacy_mode="FORCED_ANONYMOUS",
                    starts_at=datetime(2026, 11, 1),
                    ends_at=datetime(2026, 11, 2),
                    results_published_at=None,
                    created_at=created,
                    updated_at=created,
                ),
                dict(
                    id=OPEN_ELECTION,
                    title="Class Representative Election",
                    position_title="Class Representative",
                    description="One seat; one choice per voter.",
                    created_by=22,
                    status="OPEN",
                    privacy_mode="FORCED_ANONYMOUS",
                    starts_at=naive_now - hour,
                    ends_at=naive_now + hour,
                    results_published_at=None,
                    created_at=created,
                    updated_at=naive_now - hour,
                ),
                dict(
                    id=NOT_STARTED_ELECTION,
                    title="Not Started Election",
                    position_title="Class President",
                    description=None,
                    created_by=22,
                    status="OPEN",
                    privacy_mode="FORCED_ANONYMOUS",
                    starts_at=naive_now + hour,
                    ends_at=naive_now + 2 * hour,
                    results_published_at=None,
                    created_at=created,
                    updated_at=created,
                ),
                dict(
                    id=ENDED_ELECTION,
                    title="Ended Election",
                    position_title="Class President",
                    description=None,
                    created_by=22,
                    status="OPEN",
                    privacy_mode="FORCED_ANONYMOUS",
                    starts_at=naive_now - 2 * hour,
                    ends_at=naive_now - hour,
                    results_published_at=None,
                    created_at=created,
                    updated_at=created,
                ),
                dict(
                    id=CLOSED_ELECTION,
                    title="Closed Election",
                    position_title="Class President",
                    description=None,
                    created_by=22,
                    status="CLOSED",
                    privacy_mode="FORCED_ANONYMOUS",
                    starts_at=naive_now - 2 * hour,
                    ends_at=naive_now - hour,
                    results_published_at=None,
                    created_at=created,
                    updated_at=created,
                ),
            ],
        )
        connection.execute(
            Base.metadata.tables["election_candidates"].insert(),
            [
                dict(
                    id=101,
                    election_id=OPEN_ELECTION,
                    name="Candidate A",
                    description="A fictional introduction.",
                    photo_url=None,
                    display_order=0,
                    created_at=created,
                    updated_at=created,
                ),
                dict(
                    id=102,
                    election_id=OPEN_ELECTION,
                    name="Candidate B",
                    description="Another fictional introduction.",
                    photo_url=None,
                    display_order=1,
                    created_at=created,
                    updated_at=created,
                ),
                dict(
                    id=501,
                    election_id=NOT_STARTED_ELECTION,
                    name="Other Election Candidate",
                    description="Belongs to another election.",
                    photo_url=None,
                    display_order=0,
                    created_at=created,
                    updated_at=created,
                ),
            ],
        )
        connection.execute(
            Base.metadata.tables["election_voters"].insert(),
            [
                dict(
                    election_id=election_id,
                    user_id=user_id,
                    vote_quota=1,
                    created_at=created,
                    updated_at=created,
                )
                for election_id, user_id in [
                    (DRAFT_ELECTION, 21),
                    (OPEN_ELECTION, 21),
                    (OPEN_ELECTION, 23),
                    (NOT_STARTED_ELECTION, 21),
                    (ENDED_ELECTION, 21),
                    (CLOSED_ELECTION, 21),
                ]
            ],
        )
    yield engine
    engine.dispose()


def login_headers(client: TestClient, username: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": PASSWORD})
    assert response.status_code == 200, response.text
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers(client):
    return login_headers(client, "admin")


@pytest.fixture
def voter_headers(client):
    # User 21: on the roster of every seeded election.
    return login_headers(client, "voter")


@pytest.fixture
def voter2_headers(client):
    # User 23: on the OPEN election roster only.
    return login_headers(client, "voter2")


@pytest.fixture
def outsider_headers(client):
    # User 24: active account, no membership in any election.
    return login_headers(client, "outsider")
