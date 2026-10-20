from tests.api.voting.conftest import (
    CLOSED_ELECTION,
    DRAFT_ELECTION,
    OPEN_ELECTION,
)
from tests.api.voting.test_ballot import seed_vote

PARTICIPATION = "/api/v1/elections/{election_id}/participation"


def participation_of(response) -> dict:
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()["data"]


class TestParticipation:
    def test_member_before_voting_has_one_remaining_vote(self, client, voter_headers):
        data = participation_of(
            client.get(PARTICIPATION.format(election_id=OPEN_ELECTION), headers=voter_headers)
        )
        assert data == {
            "election_id": str(OPEN_ELECTION),
            "eligible": True,
            "vote_quota": 1,
            "used_votes": 0,
            "remaining_votes": 1,
        }

    def test_member_after_voting_has_zero_remaining(self, client, voter_headers, engine):
        seed_vote(engine, OPEN_ELECTION, 21, 101)
        data = participation_of(
            client.get(PARTICIPATION.format(election_id=OPEN_ELECTION), headers=voter_headers)
        )
        assert data["used_votes"] == 1
        assert data["remaining_votes"] == 0

    def test_status_is_reported_for_every_election_state(self, client, voter_headers):
        for election_id in (DRAFT_ELECTION, CLOSED_ELECTION):
            data = participation_of(
                client.get(PARTICIPATION.format(election_id=election_id), headers=voter_headers)
            )
            assert data["eligible"] is True
            assert data["remaining_votes"] == 1

    def test_non_member_of_existing_election_sees_only_false(self, client, outsider_headers):
        data = participation_of(
            client.get(PARTICIPATION.format(election_id=OPEN_ELECTION), headers=outsider_headers)
        )
        assert data == {
            "election_id": str(OPEN_ELECTION),
            "eligible": False,
            "vote_quota": 0,
            "used_votes": 0,
            "remaining_votes": 0,
        }

    def test_unknown_election_is_not_found(self, client, voter_headers):
        response = client.get(PARTICIPATION.format(election_id=999999), headers=voter_headers)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "ELECTION_NOT_FOUND"

    def test_admin_has_no_v1_participation_role(self, client, admin_headers):
        response = client.get(
            PARTICIPATION.format(election_id=OPEN_ELECTION), headers=admin_headers
        )
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "PERMISSION_DENIED"

    def test_authentication_is_required(self, client):
        response = client.get(PARTICIPATION.format(election_id=OPEN_ELECTION))
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"

    def test_rejects_unknown_query_and_request_body(self, client, voter_headers):
        queried = client.get(
            PARTICIPATION.format(election_id=OPEN_ELECTION),
            params={"user_id": "23"},
            headers=voter_headers,
        )
        assert queried.status_code == 422
        assert queried.json()["error"]["code"] == "VALIDATION_ERROR"
        body = client.request(
            "GET",
            PARTICIPATION.format(election_id=OPEN_ELECTION),
            json={},
            headers=voter_headers,
        )
        assert body.status_code == 422
