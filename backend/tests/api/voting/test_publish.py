from sqlalchemy import select

from app.models import Election
from tests.api.voting.conftest import CLOSED_ELECTION, OPEN_ELECTION
from tests.api.voting.test_results import A, B, seed_candidates

PUBLISH = "/api/v1/elections/{election_id}/results/publish"


def published_at_of(engine, election_id: int):
    with engine.connect() as connection:
        return connection.scalar(
            select(Election.results_published_at).where(Election.id == election_id)
        )


class TestPublishResults:
    def test_admin_publishes_closed_election_with_unique_winner(
        self, client, admin_headers, engine
    ):
        seed_candidates(engine, {A: 2, B: 1}, {A: 0, B: 1})
        response = client.post(PUBLISH.format(election_id=CLOSED_ELECTION), headers=admin_headers)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        data = response.json()["data"]
        assert data["election_id"] == str(CLOSED_ELECTION)
        assert data["winner_candidate_id"] == str(A)
        assert data["total_votes"] == 3
        assert data["results_published_at"] is not None
        stored = published_at_of(engine, CLOSED_ELECTION)
        assert stored is not None
        # The response carries the stored server-determined timestamp.
        assert data["results_published_at"] == stored.isoformat() + "Z"

    def test_republish_returns_original_timestamp_without_overwrite(
        self, client, admin_headers, engine
    ):
        seed_candidates(engine, {A: 1}, {A: 0})
        first = client.post(PUBLISH.format(election_id=CLOSED_ELECTION), headers=admin_headers)
        assert first.status_code == 200
        original = first.json()["data"]["results_published_at"]
        second = client.post(PUBLISH.format(election_id=CLOSED_ELECTION), headers=admin_headers)
        assert second.status_code == 200
        assert second.json()["data"]["results_published_at"] == original
        assert published_at_of(engine, CLOSED_ELECTION).isoformat() + "Z" == original

    def test_tie_publishes_with_undecided_winner(self, client, admin_headers, engine):
        seed_candidates(engine, {A: 1, B: 1}, {A: 0, B: 1})
        response = client.post(PUBLISH.format(election_id=CLOSED_ELECTION), headers=admin_headers)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["winner_candidate_id"] is None  # the system never adjudicates (FW-10)
        assert data["total_votes"] == 2
        assert data["results_published_at"] is not None
        assert published_at_of(engine, CLOSED_ELECTION) is not None

    def test_zero_votes_publish_with_zero_total(self, client, admin_headers, engine):
        seed_candidates(engine, {A: 0}, {A: 0})
        response = client.post(PUBLISH.format(election_id=CLOSED_ELECTION), headers=admin_headers)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["total_votes"] == 0
        assert data["winner_candidate_id"] is None
        assert published_at_of(engine, CLOSED_ELECTION) is not None

    def test_publish_requires_closed_status(self, client, admin_headers, engine):
        seed_candidates(engine, {A: 1}, {A: 0}, election_id=OPEN_ELECTION)
        response = client.post(PUBLISH.format(election_id=OPEN_ELECTION), headers=admin_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "ELECTION_NOT_CLOSED"
        assert published_at_of(engine, OPEN_ELECTION) is None

    def test_voters_cannot_publish(self, client, voter_headers, engine):
        seed_candidates(engine, {A: 1}, {A: 0})
        response = client.post(PUBLISH.format(election_id=CLOSED_ELECTION), headers=voter_headers)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "PERMISSION_DENIED"
        assert published_at_of(engine, CLOSED_ELECTION) is None

    def test_unknown_election_is_not_found(self, client, admin_headers):
        response = client.post(PUBLISH.format(election_id=999999), headers=admin_headers)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "ELECTION_NOT_FOUND"

    def test_authentication_is_required(self, client):
        response = client.post(PUBLISH.format(election_id=CLOSED_ELECTION))
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"

    def test_rejects_body_and_unknown_query(self, client, admin_headers):
        body = client.post(
            PUBLISH.format(election_id=CLOSED_ELECTION), json={}, headers=admin_headers
        )
        assert body.status_code == 422
        queried = client.post(
            PUBLISH.format(election_id=CLOSED_ELECTION),
            params={"force": "1"},
            headers=admin_headers,
        )
        assert queried.status_code == 422
        assert queried.json()["error"]["code"] == "VALIDATION_ERROR"
