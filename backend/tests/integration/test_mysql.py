"""Opt-in checks against an EMPTY disposable MySQL database, never a demo database."""

import os
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert, inspect, select
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from app.main import create_app
from app.models import Base, Election, ElectionVoter, User

pytestmark = pytest.mark.mysql


@pytest.fixture(scope="module")
def mysql_engine():
    value = os.environ.get("TEST_MYSQL_URL")
    if not value:
        pytest.skip("TEST_MYSQL_URL is not set; MySQL integration is not verified locally")
    url = make_url(value)
    if url.drivername != "mysql+pymysql" or not url.database or not url.database.endswith("_test"):
        pytest.fail(
            "TEST_MYSQL_URL must point to a dedicated mysql+pymysql database ending in _test"
        )
    engine = create_engine(
        url,
        hide_parameters=True,
        pool_pre_ping=True,
        connect_args={"init_command": "SET time_zone = '+00:00'", "connect_timeout": 5},
    )
    if inspect(engine).get_table_names():
        engine.dispose()
        pytest.fail("Refusing to modify a nonempty MySQL test database")
    try:
        Base.metadata.create_all(engine)
        yield engine
    finally:
        # Only our eight tables in the checked, previously empty test database.
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_mysql_schema_matches_all_eight_tables(mysql_engine):
    assert set(inspect(mysql_engine).get_table_names()) == set(Base.metadata.tables)


def test_mysql_identity_round_trip(settings, mysql_engine, password_hash):
    with mysql_engine.begin() as connection:
        connection.execute(
            insert(User).values(
                id=18446744073709551615,
                username="mysql_voter",
                password_hash=password_hash,
                display_name="MySQL Voter",
                role="USER",
                status="ACTIVE",
            )
        )
    with TestClient(create_app(settings=settings, engine=mysql_engine)) as client:
        response = client.post(
            "/api/v1/auth/login", json={"username": "mysql_voter", "password": "Password123"}
        )
        assert response.status_code == 200
        assert response.json()["data"]["user"]["id"] == "18446744073709551615"
        assert response.json()["data"]["user"]["created_at"].endswith("Z")
        assert client.get("/health/ready").status_code == 200


def test_mysql_foreign_keys_and_rollback(mysql_engine, password_hash):
    now = datetime.now(UTC).replace(tzinfo=None, microsecond=0)
    with mysql_engine.begin() as connection:
        connection.execute(
            insert(User).values(
                id=31,
                username="mysql_admin",
                password_hash=password_hash,
                display_name="Admin",
                role="ADMIN",
                status="ACTIVE",
            )
        )
        connection.execute(
            insert(Election).values(
                id=1,
                title="Integration",
                position_title="Chair",
                created_by=31,
                privacy_mode="FORCED_ANONYMOUS",
                starts_at=now,
                ends_at=now + timedelta(hours=1),
            )
        )
    with pytest.raises(IntegrityError), mysql_engine.begin() as connection:
        connection.execute(insert(ElectionVoter).values(election_id=1, user_id=999, vote_quota=1))
    with mysql_engine.connect() as connection:
        assert connection.scalar(select(ElectionVoter.user_id)) is None
