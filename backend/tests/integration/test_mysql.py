"""Opt-in checks against an EMPTY disposable MySQL database, never a demo database."""

import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from datetime import UTC, datetime, timedelta
from threading import Event

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, event, insert, inspect, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, OperationalError

from app.application.errors import AppError
from app.application.services.roster import RosterService
from app.infrastructure.persistence.orm import Base, Election, ElectionVoter, User
from app.infrastructure.persistence.repositories.roster import SqlAlchemyRosterRepository
from app.infrastructure.persistence.session import create_session_factory
from app.infrastructure.persistence.unit_of_work import SqlAlchemyUnitOfWork
from app.main import create_app

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


@pytest.fixture
def mysql_roster(mysql_engine, password_hash):
    now = datetime.now(UTC).replace(tzinfo=None, microsecond=0)
    with mysql_engine.begin() as connection:
        connection.execute(
            insert(User),
            [
                dict(
                    id=41,
                    username="roster_admin",
                    password_hash=password_hash,
                    display_name="Admin",
                    role="ADMIN",
                    status="ACTIVE",
                ),
                dict(
                    id=42,
                    username="roster_voter",
                    password_hash=password_hash,
                    display_name="Voter",
                    role="USER",
                    status="ACTIVE",
                ),
            ],
        )
        connection.execute(
            insert(Election).values(
                id=10,
                title="Roster lock test",
                position_title="Chair",
                created_by=41,
                privacy_mode="FORCED_ANONYMOUS",
                starts_at=now,
                ends_at=now + timedelta(hours=1),
            )
        )
        connection.execute(insert(ElectionVoter).values(election_id=10, user_id=42, vote_quota=1))
    factory = create_session_factory(mysql_engine)
    yield RosterService(lambda: SqlAlchemyUnitOfWork(factory))
    with mysql_engine.begin() as connection:
        connection.execute(delete(ElectionVoter).where(ElectionVoter.election_id == 10))
        connection.execute(delete(Election).where(Election.id == 10))
        connection.execute(delete(User).where(User.id.in_([41, 42])))


def mutate_roster(service, operation):
    if operation == "add":
        return service.add_voter(10, 42, 1)
    return service.remove_voter(10, 42)


@pytest.mark.parametrize("operation", ["add", "remove"])
def test_mysql_open_waits_for_roster_commit(mysql_engine, mysql_roster, monkeypatch, operation):
    if operation == "add":
        with mysql_engine.begin() as connection:
            connection.execute(delete(ElectionVoter).where(ElectionVoter.election_id == 10))
    locked, release = Event(), Event()
    original = SqlAlchemyRosterRepository.election

    def pause_after_lock(repository, election_id, *, for_update=False):
        election = original(repository, election_id, for_update=for_update)
        if for_update:
            locked.set()
            assert release.wait(10), "Roster test did not release election lock"
        return election

    monkeypatch.setattr(SqlAlchemyRosterRepository, "election", pause_after_lock)
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(mutate_roster, mysql_roster, operation)
        try:
            assert locked.wait(5), "Roster mutation did not acquire an election lock"
            # An actual InnoDB lock timeout proves UPDATE cannot pass the roster transaction.
            with pytest.raises(OperationalError) as error, mysql_engine.begin() as connection:
                connection.execute(text("SET SESSION innodb_lock_wait_timeout = 1"))
                connection.execute(update(Election).where(Election.id == 10).values(status="OPEN"))
            assert error.value.orig.args[0] == 1205
        finally:
            release.set()
        future.result(timeout=5)
    with mysql_engine.begin() as connection:
        connection.execute(update(Election).where(Election.id == 10).values(status="OPEN"))
        membership = connection.scalar(
            select(ElectionVoter.user_id).where(ElectionVoter.election_id == 10)
        )
        assert (membership is not None) == (operation == "add")


@pytest.mark.parametrize("operation", ["add", "remove"])
def test_mysql_roster_waits_for_open_then_rejects(mysql_engine, mysql_roster, operation):
    if operation == "add":
        with mysql_engine.begin() as connection:
            connection.execute(delete(ElectionVoter).where(ElectionVoter.election_id == 10))
    attempted = Event()

    def observe_lock(connection, cursor, statement, parameters, context, executemany):
        if statement.startswith("SELECT") and "FOR UPDATE" in statement:
            attempted.set()

    event.listen(mysql_engine, "before_cursor_execute", observe_lock)
    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            with mysql_engine.begin() as connection:
                connection.execute(update(Election).where(Election.id == 10).values(status="OPEN"))
                future = executor.submit(mutate_roster, mysql_roster, operation)
                assert attempted.wait(5), "Roster mutation did not request a locking read"
                with pytest.raises(TimeoutError):
                    future.result(timeout=0.2)
            # The locking read must see committed OPEN, even under REPEATABLE READ.
            with pytest.raises(AppError) as error:
                future.result(timeout=5)
            assert error.value.code == "ELECTION_NOT_EDITABLE"
    finally:
        event.remove(mysql_engine, "before_cursor_execute", observe_lock)
    with mysql_engine.connect() as connection:
        assert connection.scalar(select(Election.status).where(Election.id == 10)) == "OPEN"
        membership = connection.scalar(
            select(ElectionVoter.user_id).where(ElectionVoter.election_id == 10)
        )
        assert (membership is not None) == (operation == "remove")
