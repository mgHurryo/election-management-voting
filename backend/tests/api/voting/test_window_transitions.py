"""API-level checks for the window transition runner over the SQLite seed.

The shared voting seed provides ENDED_ELECTION (OPEN, window over) and
DRAFT_ELECTION; the scheduler itself is disabled in tests, so every case drives
``run_window_transitions`` directly with an explicit clock.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import insert, update

from app.models import Election, ElectionCandidate
from app.services.window import run_window_transitions
from tests.api.voting.conftest import DRAFT_ELECTION, ENDED_ELECTION, OPEN_ELECTION

ELECTIONS = "/api/v1/elections"


def now() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def run(app):
    container = app.state.container
    return run_window_transitions(container.unit_of_work, container.elections)


def status_of(client, headers, election_id):
    response = client.get(f"{ELECTIONS}/{election_id}", headers=headers)
    assert response.status_code == 200
    return response.json()["data"]["status"]


def activate_window(engine, election_id):
    hour = timedelta(hours=1)
    start = now() - hour
    with engine.begin() as connection:
        connection.execute(
            update(Election)
            .where(Election.id == election_id)
            .values(
                starts_at=start.replace(tzinfo=None), ends_at=(now() + hour).replace(tzinfo=None)
            )
        )


def add_candidate(engine, election_id, candidate_id):
    created = datetime(2026, 10, 1)
    with engine.begin() as connection:
        connection.execute(
            insert(ElectionCandidate).values(
                id=candidate_id,
                election_id=election_id,
                name="Ready Candidate",
                description="A valid introduction.",
                photo_url=None,
                display_order=0,
                created_at=created,
                updated_at=created,
            )
        )


def test_closes_open_elections_past_their_window(client, app, admin_headers, voter_headers):
    assert status_of(client, admin_headers, ENDED_ELECTION) == "OPEN"

    opened, closed = run(app)

    assert (opened, closed) == (0, 1)
    assert status_of(client, admin_headers, ENDED_ELECTION) == "CLOSED"
    # Elections inside or ahead of their window are untouched.
    assert status_of(client, admin_headers, OPEN_ELECTION) == "OPEN"
    # After closure the ballot endpoint stops claiming the vote merely ended.
    response = client.get(f"{ELECTIONS}/{ENDED_ELECTION}/ballot", headers=voter_headers)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ELECTION_NOT_OPEN"


def test_opens_ready_draft_once_its_window_starts(client, app, engine, admin_headers):
    activate_window(engine, DRAFT_ELECTION)
    add_candidate(engine, DRAFT_ELECTION, 901)

    opened, _closed = run(app)

    assert opened == 1
    assert status_of(client, admin_headers, DRAFT_ELECTION) == "OPEN"


def test_keeps_unready_drafts_out_of_voting(client, app, engine, admin_headers):
    activate_window(engine, DRAFT_ELECTION)

    run(app)

    assert status_of(client, admin_headers, DRAFT_ELECTION) == "DRAFT"


def test_never_revives_a_draft_whose_window_already_ended(client, app, engine, admin_headers):
    activate_window(engine, DRAFT_ELECTION)
    add_candidate(engine, DRAFT_ELECTION, 902)
    with engine.begin() as connection:
        connection.execute(
            update(Election)
            .where(Election.id == DRAFT_ELECTION)
            .values(
                starts_at=datetime(2026, 10, 1, 0, 0, 0),
                ends_at=datetime(2026, 10, 1, 8, 0, 0),
            )
        )

    run(app)

    assert status_of(client, admin_headers, DRAFT_ELECTION) == "DRAFT"
