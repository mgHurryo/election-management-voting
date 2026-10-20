from datetime import UTC, datetime

from sqlalchemy import insert, update

from app.models import Election, ElectionCandidate
from tests.api.voting.conftest import (
    CLOSED_ELECTION,
    OPEN_ELECTION,
)
from tests.api.voting.test_ballot import seed_vote

RESULTS = "/api/v1/elections/{election_id}/results"

A, B, C, D = 5011, 5012, 5013, 5014


def seed_candidates(
    engine,
    counts: dict[int, int],
    display_orders: dict[int, int],
    *,
    election_id: int = CLOSED_ELECTION,
) -> None:
    """Close-election candidates plus the ballot count each one should show."""
    created = datetime(2026, 10, 1)
    with engine.begin() as connection:
        connection.execute(
            insert(ElectionCandidate),
            [
                dict(
                    id=candidate_id,
                    election_id=election_id,
                    name=f"Candidate {candidate_id}",
                    description="A fictional introduction.",
                    photo_url=None,
                    display_order=display_orders[candidate_id],
                    created_at=created,
                    updated_at=created,
                )
                for candidate_id in counts
            ],
        )
    for sequence, candidate_id in enumerate(
        [candidate for candidate, votes in counts.items() for _ in range(votes)], start=1
    ):
        seed_vote(engine, election_id, 21, candidate_id, vote_sequence=sequence)


def test_admin_previews_recomputed_tally(client, admin_headers, engine):
    seed_candidates(engine, {A: 2, B: 1, C: 0}, {A: 0, B: 1, C: 2})
    response = client.get(RESULTS.format(election_id=CLOSED_ELECTION), headers=admin_headers)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    data = response.json()["data"]
    assert data["election_id"] == str(CLOSED_ELECTION)
    assert data["position_title"] == "Class President"
    assert data["results_published_at"] is None  # preview, not a publication
    assert [row["candidate_id"] for row in data["candidates"]] == [str(A), str(B), str(C)]
    assert [row["vote_count"] for row in data["candidates"]] == [2, 1, 0]
    assert data["total_votes"] == 3
    assert data["winner_candidate_id"] == str(A)


def test_vote_order_ties_break_by_display_order_then_id(client, admin_headers, engine):
    seed_candidates(engine, {D: 2, A: 2}, {D: 0, A: 1})
    response = client.get(RESULTS.format(election_id=CLOSED_ELECTION), headers=admin_headers)
    data = response.json()["data"]
    assert [row["candidate_id"] for row in data["candidates"]] == [str(D), str(A)]
    assert data["winner_candidate_id"] is None  # tie stays undecided


def test_all_zero_votes_stay_undecided(client, admin_headers, engine):
    seed_candidates(engine, {A: 0, B: 0}, {A: 0, B: 1})
    response = client.get(RESULTS.format(election_id=CLOSED_ELECTION), headers=admin_headers)
    data = response.json()["data"]
    assert data["total_votes"] == 0
    assert data["winner_candidate_id"] is None


def test_admin_requires_closed_status(client, admin_headers, engine):
    seed_candidates(engine, {A: 0}, {A: 0})
    response = client.get(RESULTS.format(election_id=OPEN_ELECTION), headers=admin_headers)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ELECTION_NOT_CLOSED"


def test_user_gets_uniform_unpublished_error_without_state_leak(
    client, voter_headers, outsider_headers, engine
):
    seed_candidates(engine, {A: 1}, {A: 0})
    for headers in (voter_headers, outsider_headers):  # roster member or not
        response = client.get(RESULTS.format(election_id=CLOSED_ELECTION), headers=headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "RESULTS_NOT_PUBLISHED"


def test_any_active_user_reads_published_results(client, voter_headers, outsider_headers, engine):
    seed_candidates(engine, {A: 2, B: 1}, {A: 0, B: 1})
    published = datetime.now(UTC).replace(microsecond=0, tzinfo=None)
    with engine.begin() as connection:
        connection.execute(
            update(Election)
            .where(Election.id == CLOSED_ELECTION)
            .values(results_published_at=published)
        )
    for headers in (voter_headers, outsider_headers):  # roster membership is irrelevant
        response = client.get(RESULTS.format(election_id=CLOSED_ELECTION), headers=headers)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["winner_candidate_id"] == str(A)
        assert data["results_published_at"] == published.isoformat() + "Z"


def test_unknown_election_is_not_found(client, admin_headers):
    response = client.get(RESULTS.format(election_id=999999), headers=admin_headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "ELECTION_NOT_FOUND"


def test_authentication_is_required(client):
    response = client.get(RESULTS.format(election_id=CLOSED_ELECTION))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


def test_rejects_unknown_query_and_request_body(client, admin_headers):
    queried = client.get(
        RESULTS.format(election_id=CLOSED_ELECTION), params={"refresh": "1"}, headers=admin_headers
    )
    assert queried.status_code == 422
    assert queried.json()["error"]["code"] == "VALIDATION_ERROR"
    body = client.request(
        "GET", RESULTS.format(election_id=CLOSED_ELECTION), json={}, headers=admin_headers
    )
    assert body.status_code == 422
