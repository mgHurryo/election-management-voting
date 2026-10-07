"""M4 ballot and voting tests: API.md 4.16 (ballot view), 4.17 (participation),
4.18 (cast anonymous vote).

Owner: backend developer F. Core test scope: the one-person-one-vote limit
(FR-10 / BR-03 / AC-04) and the v1 anonymity invariant (NFR-2): ballots rows
are stored with voter_id NULL and is_anonymous TRUE.
Until the ballot/votes routers are implemented these tests fail with 404
ROUTE_NOT_FOUND; that is the expected red state of test-first development.
"""

import pytest
from sqlalchemy import func, select

from app.models import Ballot, BallotChoice, VoteParticipation
from tests.api.voting.conftest import (
    CLOSED_ELECTION,
    DRAFT_ELECTION,
    ENDED_ELECTION,
    NOT_STARTED_ELECTION,
    OPEN_ELECTION,
)

BALLOT = "/api/v1/elections/{election_id}/ballot"
PARTICIPATION = "/api/v1/elections/{election_id}/participation"
VOTES = "/api/v1/elections/{election_id}/votes"


def ballot_path(election_id: int) -> str:
    return BALLOT.format(election_id=election_id)


def participation_path(election_id: int) -> str:
    return PARTICIPATION.format(election_id=election_id)


def votes_path(election_id: int) -> str:
    return VOTES.format(election_id=election_id)


def cast_vote(client, headers, election_id=OPEN_ELECTION, candidate_id="101"):
    return client.post(
        votes_path(election_id), json={"candidate_id": candidate_id}, headers=headers
    )


class TestBallotView:
    """API.md 4.16 — GET /api/v1/elections/{election_id}/ballot (eligible USER)."""

    def test_eligible_voter_sees_ballot_with_participation(self, client, voter_headers):
        response = client.get(ballot_path(OPEN_ELECTION), headers=voter_headers)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        data = response.json()["data"]
        election = data["election"]
        assert election["id"] == "2002"
        assert election["title"] == "Class Representative Election"
        assert election["position_title"] == "Class Representative"
        assert election["status"] == "OPEN"
        assert election["privacy_mode"] == "FORCED_ANONYMOUS"
        assert election["results_published_at"] is None
        assert election["starts_at"].endswith("Z")
        assert election["ends_at"].endswith("Z")
        # Candidates ordered by display_order then numeric id, unpaginated.
        assert [candidate["id"] for candidate in data["candidates"]] == ["101", "102"]
        candidate = data["candidates"][0]
        assert candidate["name"] == "Candidate A"
        assert candidate["position_title"] == "Class Representative"
        assert candidate["display_order"] == 0
        assert data["participation"] == {
            "election_id": "2002",
            "eligible": True,
            "vote_quota": 1,
            "used_votes": 0,
            "remaining_votes": 1,
        }

    def test_voted_voter_sees_quota_zero_without_their_choice(self, client, voter_headers):
        assert cast_vote(client, voter_headers).status_code == 201
        response = client.get(ballot_path(OPEN_ELECTION), headers=voter_headers)
        assert response.status_code == 200
        participation = response.json()["data"]["participation"]
        assert participation["used_votes"] == 1
        assert participation["remaining_votes"] == 0
        # The view never echoes the earlier choice.
        assert "candidate_id" not in response.text

    def test_non_member_gets_not_eligible(self, client, outsider_headers):
        response = client.get(ballot_path(OPEN_ELECTION), headers=outsider_headers)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "NOT_ELIGIBLE"

    def test_admin_cannot_view_ballot(self, client, admin_headers):
        response = client.get(ballot_path(OPEN_ELECTION), headers=admin_headers)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "PERMISSION_DENIED"

    def test_draft_election_is_not_open(self, client, voter_headers):
        response = client.get(ballot_path(DRAFT_ELECTION), headers=voter_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "ELECTION_NOT_OPEN"

    def test_closed_election_is_not_open(self, client, voter_headers):
        response = client.get(ballot_path(CLOSED_ELECTION), headers=voter_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "ELECTION_NOT_OPEN"

    def test_window_not_started_yet(self, client, voter_headers):
        response = client.get(ballot_path(NOT_STARTED_ELECTION), headers=voter_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VOTING_NOT_STARTED"

    def test_window_already_ended(self, client, voter_headers):
        response = client.get(ballot_path(ENDED_ELECTION), headers=voter_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VOTING_ENDED"

    def test_unknown_election_is_not_found(self, client, voter_headers):
        response = client.get(ballot_path(999999), headers=voter_headers)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "ELECTION_NOT_FOUND"

    def test_unauthenticated_request_is_rejected(self, client):
        response = client.get(ballot_path(OPEN_ELECTION))
        assert response.status_code == 401


class TestSelfParticipation:
    """API.md 4.17 — GET /api/v1/elections/{election_id}/participation (USER)."""

    def test_member_sees_own_quota(self, client, voter_headers):
        response = client.get(participation_path(OPEN_ELECTION), headers=voter_headers)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        assert response.json() == {
            "data": {
                "election_id": "2002",
                "eligible": True,
                "vote_quota": 1,
                "used_votes": 0,
                "remaining_votes": 1,
            }
        }

    def test_used_quota_after_voting(self, client, voter_headers):
        assert cast_vote(client, voter_headers).status_code == 201
        response = client.get(participation_path(OPEN_ELECTION), headers=voter_headers)
        data = response.json()["data"]
        assert data["used_votes"] == 1
        assert data["remaining_votes"] == 0

    def test_non_member_gets_zero_counts_not_an_error(self, client, outsider_headers):
        response = client.get(participation_path(OPEN_ELECTION), headers=outsider_headers)
        assert response.status_code == 200
        assert response.json()["data"] == {
            "election_id": "2002",
            "eligible": False,
            "vote_quota": 0,
            "used_votes": 0,
            "remaining_votes": 0,
        }

    def test_works_in_any_election_state(self, client, voter_headers):
        # Available in DRAFT (and CLOSED), regardless of publication.
        response = client.get(participation_path(DRAFT_ELECTION), headers=voter_headers)
        assert response.status_code == 200
        assert response.json()["data"]["eligible"] is True

    def test_admin_gets_permission_denied(self, client, admin_headers):
        response = client.get(participation_path(OPEN_ELECTION), headers=admin_headers)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "PERMISSION_DENIED"

    def test_unknown_election_is_not_found(self, client, voter_headers):
        response = client.get(participation_path(999999), headers=voter_headers)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "ELECTION_NOT_FOUND"


class TestCastVote:
    """API.md 4.18 — POST /api/v1/elections/{election_id}/votes (eligible USER)."""

    def test_eligible_voter_casts_anonymous_vote(self, client, voter_headers, engine):
        response = cast_vote(client, voter_headers, candidate_id="101")
        assert response.status_code == 201
        assert response.headers["cache-control"] == "no-store"
        assert response.json() == {"data": {"election_id": "2002", "accepted": True}}
        with engine.begin() as connection:
            ballots = connection.execute(
                select(Ballot.voter_id, Ballot.is_anonymous).where(
                    Ballot.election_id == OPEN_ELECTION
                )
            ).all()
            choices = connection.execute(
                select(BallotChoice.candidate_id)
                .join(Ballot, Ballot.id == BallotChoice.ballot_id)
                .where(Ballot.election_id == OPEN_ELECTION)
            ).all()
            participation = connection.execute(
                select(VoteParticipation.vote_sequence).where(
                    VoteParticipation.election_id == OPEN_ELECTION,
                    VoteParticipation.user_id == 21,
                )
            ).all()
        # NFR-2 / v1 anonymity invariant: stored ballots carry no voter identity.
        assert ballots == [(None, True)]
        assert choices == [(101,)]
        assert participation == [(1,)]

    def test_duplicate_vote_is_rejected_and_original_kept(self, client, voter_headers, engine):
        """AC-04 core: one person one vote; the first ballot is never modified."""
        assert cast_vote(client, voter_headers, candidate_id="101").status_code == 201
        second = cast_vote(client, voter_headers, candidate_id="101")
        assert second.status_code == 409
        assert second.json()["error"]["code"] == "VOTE_QUOTA_EXHAUSTED"
        assert second.headers["cache-control"] == "no-store"
        with engine.begin() as connection:
            ballot_count = connection.execute(
                select(func.count()).select_from(Ballot).where(Ballot.election_id == OPEN_ELECTION)
            ).scalar_one()
            stored_choice = connection.execute(
                select(BallotChoice.candidate_id)
                .join(Ballot, Ballot.id == BallotChoice.ballot_id)
                .where(Ballot.election_id == OPEN_ELECTION)
            ).scalar_one()
        assert ballot_count == 1
        assert stored_choice == 101

    def test_second_vote_for_another_candidate_is_also_rejected(self, client, voter_headers):
        assert cast_vote(client, voter_headers, candidate_id="101").status_code == 201
        response = cast_vote(client, voter_headers, candidate_id="102")
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VOTE_QUOTA_EXHAUSTED"

    def test_two_members_each_vote_once(self, client, voter_headers, voter2_headers, engine):
        assert cast_vote(client, voter_headers, candidate_id="101").status_code == 201
        assert cast_vote(client, voter2_headers, candidate_id="102").status_code == 201
        with engine.begin() as connection:
            ballots = connection.execute(
                select(func.count()).select_from(Ballot).where(Ballot.election_id == OPEN_ELECTION)
            ).scalar_one()
            per_candidate = connection.execute(
                select(BallotChoice.candidate_id, func.count())
                .join(Ballot, Ballot.id == BallotChoice.ballot_id)
                .where(Ballot.election_id == OPEN_ELECTION)
                .group_by(BallotChoice.candidate_id)
            ).all()
        assert ballots == 2
        assert sorted(per_candidate) == [(101, 1), (102, 1)]

    def test_non_member_cannot_vote(self, client, outsider_headers):
        response = cast_vote(client, outsider_headers)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "NOT_ELIGIBLE"

    def test_admin_cannot_vote(self, client, admin_headers):
        response = cast_vote(client, admin_headers)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "PERMISSION_DENIED"

    @pytest.mark.parametrize("candidate_id", ["999", "501"])
    def test_missing_or_cross_election_candidate_is_invalid(
        self, client, voter_headers, candidate_id
    ):
        response = cast_vote(client, voter_headers, candidate_id=candidate_id)
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "INVALID_CANDIDATE"

    def test_draft_election_rejects_vote(self, client, voter_headers):
        response = cast_vote(client, voter_headers, election_id=DRAFT_ELECTION)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "ELECTION_NOT_OPEN"

    def test_closed_election_rejects_vote(self, client, voter_headers):
        response = cast_vote(client, voter_headers, election_id=CLOSED_ELECTION)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "ELECTION_NOT_OPEN"

    def test_window_not_started_rejects_vote(self, client, voter_headers):
        response = cast_vote(client, voter_headers, election_id=NOT_STARTED_ELECTION)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VOTING_NOT_STARTED"

    def test_window_ended_rejects_vote(self, client, voter_headers):
        response = cast_vote(client, voter_headers, election_id=ENDED_ELECTION)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VOTING_ENDED"

    def test_unknown_election_is_not_found(self, client, voter_headers):
        response = cast_vote(client, voter_headers, election_id=999999)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "ELECTION_NOT_FOUND"

    @pytest.mark.parametrize(
        "body",
        [
            {"candidate_id": 101},
            {"candidate_id": "101", "write_in": "extra"},
            {},
            {"candidate_id": "0"},
            {"candidate_id": "abc"},
        ],
    )
    def test_input_allowlist_and_id_string_type(self, client, voter_headers, body):
        response = client.post(votes_path(OPEN_ELECTION), json=body, headers=voter_headers)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_unauthenticated_vote_is_rejected(self, client):
        response = client.post(votes_path(OPEN_ELECTION), json={"candidate_id": "101"})
        assert response.status_code == 401

    def test_success_response_is_not_a_receipt(self, client, voter_headers):
        response = cast_vote(client, voter_headers, candidate_id="102")
        assert response.status_code == 201
        # No ballot id, candidate echo, receipt URL or submission time.
        assert set(response.json()["data"]) == {"election_id", "accepted"}
        assert "location" not in response.headers
        assert "102" not in response.text
