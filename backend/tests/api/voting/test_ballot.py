
from app.models import Ballot, BallotChoice, VoteParticipation
from tests.api.voting.conftest import (
    CLOSED_ELECTION,
    DRAFT_ELECTION,
    ENDED_ELECTION,
    NOT_STARTED_ELECTION,
    OPEN_ELECTION,
)

BALLOT = "/api/v1/elections/{election_id}/ballot"


def seed_vote(engine, election_id: int, user_id: int, candidate_id: int) -> None:
    """Insert one committed vote the way the endpoint itself would."""
    with engine.begin() as connection:
        connection.execute(
            VoteParticipation.__table__.insert().values(
                election_id=election_id, user_id=user_id, vote_sequence=1
            )
        )
        result = connection.execute(
            Ballot.__table__.insert().values(
                election_id=election_id, voter_id=None, is_anonymous=True
            )
        )
        connection.execute(
            BallotChoice.__table__.insert().values(
                election_id=election_id,
                ballot_id=result.inserted_primary_key[0],
                candidate_id=candidate_id,
            )
        )


class TestBallotView:
    def test_eligible_voter_gets_full_open_ballot(self, client, voter_headers):
        response = client.get(BALLOT.format(election_id=OPEN_ELECTION), headers=voter_headers)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        ballot = response.json()["data"]
        assert ballot["election"]["id"] == str(OPEN_ELECTION)
        assert ballot["election"]["status"] == "OPEN"
        assert ballot["election"]["position_title"] == "Class Representative"
        # All candidates, ballot order, no pagination envelope.
        assert [row["id"] for row in ballot["candidates"]] == ["101", "102"]
        assert ballot["candidates"][0]["position_title"] == "Class Representative"
        assert ballot["participation"] == {
            "election_id": str(OPEN_ELECTION),
            "eligible": True,
            "vote_quota": 1,
            "used_votes": 0,
            "remaining_votes": 1,
        }

    def test_voted_voter_sees_zero_remaining_without_stored_choice(
        self, client, voter_headers, engine
    ):
        seed_vote(engine, OPEN_ELECTION, 21, 101)
        response = client.get(BALLOT.format(election_id=OPEN_ELECTION), headers=voter_headers)
        assert response.status_code == 200
        ballot = response.json()["data"]
        assert ballot["participation"]["used_votes"] == 1
        assert ballot["participation"]["remaining_votes"] == 0
        # The participation block never carries a stored ballot reference or choice.
        assert set(ballot["participation"]) == {
            "election_id",
            "eligible",
            "vote_quota",
            "used_votes",
            "remaining_votes",
        }

    def test_non_member_is_rejected_before_state_checks(self, client, outsider_headers):
        response = client.get(BALLOT.format(election_id=OPEN_ELECTION), headers=outsider_headers)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "NOT_ELIGIBLE"
        # Eligibility precedes the time window in the documented check order.
        response = client.get(
            BALLOT.format(election_id=NOT_STARTED_ELECTION), headers=outsider_headers
        )
        assert response.json()["error"]["code"] == "NOT_ELIGIBLE"

    def test_admin_has_no_v1_voting_role(self, client, admin_headers):
        response = client.get(BALLOT.format(election_id=OPEN_ELECTION), headers=admin_headers)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "PERMISSION_DENIED"

    def test_ballot_requires_open_status(self, client, voter_headers):
        for election_id in (DRAFT_ELECTION, CLOSED_ELECTION):
            response = client.get(BALLOT.format(election_id=election_id), headers=voter_headers)
            assert response.status_code == 409
            assert response.json()["error"]["code"] == "ELECTION_NOT_OPEN"

    def test_time_window_bounds_are_inclusive(self, client, voter_headers):
        response = client.get(
            BALLOT.format(election_id=NOT_STARTED_ELECTION), headers=voter_headers
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VOTING_NOT_STARTED"
        response = client.get(BALLOT.format(election_id=ENDED_ELECTION), headers=voter_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VOTING_ENDED"

    def test_unknown_election_is_not_found(self, client, voter_headers, outsider_headers):
        for headers in (voter_headers, outsider_headers):
            response = client.get(BALLOT.format(election_id=999999), headers=headers)
            assert response.status_code == 404
            assert response.json()["error"]["code"] == "ELECTION_NOT_FOUND"

    def test_authentication_is_required(self, client):
        response = client.get(BALLOT.format(election_id=OPEN_ELECTION))
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"

    def test_rejects_unknown_query_and_request_body(self, client, voter_headers):
        queried = client.get(
            BALLOT.format(election_id=OPEN_ELECTION), params={"page": "1"}, headers=voter_headers
        )
        assert queried.status_code == 422
        assert queried.json()["error"]["code"] == "VALIDATION_ERROR"
        body = client.request(
            "GET",
            BALLOT.format(election_id=OPEN_ELECTION),
            json={},
            headers=voter_headers,
        )
        assert body.status_code == 422
        assert body.json()["error"]["code"] == "VALIDATION_ERROR"
