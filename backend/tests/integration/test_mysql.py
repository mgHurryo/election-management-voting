"""Opt-in checks against an EMPTY disposable MySQL database, never a demo database."""

import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from datetime import UTC, datetime, timedelta
from threading import Event

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, event, func, insert, inspect, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, OperationalError

from app.core.errors import AppError
from app.db.session import create_session_factory
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.main import create_app
from app.models import (
    Ballot,
    BallotChoice,
    Base,
    Election,
    ElectionCandidate,
    ElectionVoter,
    User,
    VoteParticipation,
)
from app.models.identity import UserIdentity
from app.repositories.elections import SqlAlchemyElectionsRepository
from app.repositories.roster import SqlAlchemyRosterRepository
from app.repositories.voting import SqlAlchemyVotingRepository
from app.services.elections import ElectionsService
from app.services.roster import RosterService
from app.services.voting import VotingService

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


@pytest.fixture
def mysql_elections(mysql_engine, password_hash):
    now = datetime.now(UTC).replace(tzinfo=None, microsecond=0)
    with mysql_engine.begin() as connection:
        connection.execute(
            insert(User),
            [
                dict(
                    id=51,
                    username="election_admin",
                    password_hash=password_hash,
                    display_name="Admin",
                    role="ADMIN",
                    status="ACTIVE",
                ),
                dict(
                    id=52,
                    username="election_voter",
                    password_hash=password_hash,
                    display_name="Voter",
                    role="USER",
                    status="ACTIVE",
                ),
            ],
        )
        connection.execute(
            insert(Election).values(
                id=20,
                title="Election lock test",
                position_title="Chair",
                created_by=51,
                status="DRAFT",
                privacy_mode="FORCED_ANONYMOUS",
                starts_at=now - timedelta(minutes=5),
                ends_at=now + timedelta(minutes=5),
            )
        )
        connection.execute(insert(ElectionVoter).values(election_id=20, user_id=52, vote_quota=1))
        connection.execute(
            insert(ElectionCandidate).values(
                id=201,
                election_id=20,
                name="Existing Candidate",
                description="Valid introduction.",
                display_order=0,
            )
        )
    factory = create_session_factory(mysql_engine)
    service = ElectionsService(lambda: SqlAlchemyUnitOfWork(factory))
    yield service
    with mysql_engine.begin() as connection:
        connection.execute(delete(ElectionCandidate).where(ElectionCandidate.election_id == 20))
        connection.execute(delete(ElectionVoter).where(ElectionVoter.election_id == 20))
        connection.execute(delete(Election).where(Election.id == 20))
        connection.execute(delete(User).where(User.id.in_([51, 52])))


def test_mysql_open_waits_for_candidate_edit_commit(mysql_engine, mysql_elections, monkeypatch):
    locked, release = Event(), Event()
    original = SqlAlchemyElectionsRepository.election

    def pause_after_lock(repository, election_id, *, for_update=False):
        election = original(repository, election_id, for_update=for_update)
        if for_update:
            locked.set()
            assert release.wait(10), "Candidate mutation did not release election lock"
        return election

    monkeypatch.setattr(SqlAlchemyElectionsRepository, "election", pause_after_lock)
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(
            mysql_elections.add_candidate,
            20,
            name="Concurrent Candidate",
            description="Added before opening.",
            photo_url=None,
            display_order=1,
        )
        try:
            assert locked.wait(5), "Candidate mutation did not acquire election lock"
            with pytest.raises(OperationalError) as error, mysql_engine.begin() as connection:
                connection.execute(text("SET SESSION innodb_lock_wait_timeout = 1"))
                connection.execute(update(Election).where(Election.id == 20).values(status="OPEN"))
            assert error.value.orig.args[0] == 1205
        finally:
            release.set()
        future.result(timeout=5)

    opened = mysql_elections.open_election(20)
    assert opened.status == "OPEN"


@pytest.fixture
def mysql_ballot(mysql_engine, password_hash):
    """One OPEN election (30) with candidate 3001 and roster voter 71, per test."""
    now = datetime.now(UTC).replace(tzinfo=None, microsecond=0)
    with mysql_engine.begin() as connection:
        connection.execute(
            insert(User).values(
                id=71,
                username="ballot_voter",
                password_hash=password_hash,
                display_name="Voter",
                role="USER",
                status="ACTIVE",
            )
        )
        connection.execute(
            insert(Election).values(
                id=30,
                title="Ballot lock test",
                position_title="Chair",
                created_by=71,
                status="OPEN",
                privacy_mode="FORCED_ANONYMOUS",
                starts_at=now - timedelta(hours=1),
                ends_at=now + timedelta(hours=1),
            )
        )
        connection.execute(
            insert(ElectionCandidate).values(
                id=3001,
                election_id=30,
                name="Only Candidate",
                description="Sole candidate for the vote transaction.",
                display_order=0,
            )
        )
        connection.execute(insert(ElectionVoter).values(election_id=30, user_id=71, vote_quota=1))
    factory = create_session_factory(mysql_engine)
    voter = UserIdentity(
        id=71,
        username="ballot_voter",
        display_name="Voter",
        role="USER",
        status="ACTIVE",
        created_at=now,
        updated_at=now,
    )
    yield VotingService(lambda: SqlAlchemyUnitOfWork(factory)), voter
    with mysql_engine.begin() as connection:
        connection.execute(delete(BallotChoice).where(BallotChoice.election_id == 30))
        connection.execute(delete(Ballot).where(Ballot.election_id == 30))
        connection.execute(delete(VoteParticipation).where(VoteParticipation.election_id == 30))
        connection.execute(delete(ElectionCandidate).where(ElectionCandidate.election_id == 30))
        connection.execute(delete(ElectionVoter).where(ElectionVoter.election_id == 30))
        connection.execute(delete(Election).where(Election.id == 30))
        connection.execute(delete(User).where(User.id == 71))


def test_mysql_close_waits_for_inflight_vote_commit(mysql_engine, mysql_ballot, monkeypatch):
    voting, voter = mysql_ballot
    locked, release = Event(), Event()
    original = SqlAlchemyVotingRepository.election

    def pause_after_share_lock(repository, election_id, *, for_update=False, for_share=False):
        election = original(repository, election_id, for_update=for_update, for_share=for_share)
        if for_share:
            locked.set()
            assert release.wait(10), "Vote test did not release the shared election lock"
        return election

    monkeypatch.setattr(SqlAlchemyVotingRepository, "election", pause_after_share_lock)
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(voting.cast_vote, 30, voter, 3001)
        try:
            assert locked.wait(5), "Vote transaction did not take the shared election lock"
            # The close transition must block until the in-flight vote commits (ADR-007).
            with pytest.raises(OperationalError) as error, mysql_engine.begin() as connection:
                connection.execute(text("SET SESSION innodb_lock_wait_timeout = 1"))
                connection.execute(
                    update(Election).where(Election.id == 30).values(status="CLOSED")
                )
            assert error.value.orig.args[0] == 1205
        finally:
            release.set()
        accepted = future.result(timeout=5)
    assert accepted.accepted is True

    with mysql_engine.begin() as connection:
        connection.execute(update(Election).where(Election.id == 30).values(status="CLOSED"))
    with pytest.raises(AppError) as error:
        voting.cast_vote(30, voter, 3001)
    assert error.value.code == "ELECTION_NOT_OPEN"


def test_mysql_concurrent_votes_allow_single_ballot(mysql_engine, mysql_ballot):
    voting, voter = mysql_ballot
    start = Event()

    def submit():
        assert start.wait(5), "Concurrent vote test did not start"
        try:
            return ("accepted", voting.cast_vote(30, voter, 3001))
        except AppError as error:
            return (error.code, None)

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(submit) for _ in range(2)]
        start.set()
        outcomes = sorted(future.result(timeout=10)[0] for future in futures)

    # FR-10/AC-04: the roster row lock serializes the quota recount, so exactly
    # one request commits the only ballot and the loser reports an exhausted quota.
    assert outcomes == ["VOTE_QUOTA_EXHAUSTED", "accepted"]
    with mysql_engine.connect() as connection:
        assert connection.scalar(
            select(func.count()).select_from(Ballot).where(Ballot.election_id == 30)
        ) == 1
        assert (
            connection.scalar(
                select(func.count())
                .select_from(VoteParticipation)
                .where(VoteParticipation.election_id == 30)
            )
            == 1
        )
        assert (
            connection.scalar(
                select(func.count())
                .select_from(BallotChoice)
                .where(BallotChoice.election_id == 30)
            )
            == 1
        )
