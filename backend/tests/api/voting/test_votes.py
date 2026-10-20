from sqlalchemy import func, select

from app.models import Ballot, BallotChoice, VoteParticipation
from tests.api.voting.conftest import (
    CLOSED_ELECTION,
    DRAFT_ELECTION,
    ENDED_ELECTION,
    NOT_STARTED_ELECTION,
    OPEN_ELECTION,
)

VOTES = "/api/v1/elections/{election_id}/votes"


def vote_payload(**changes):
    payload = {"candidate_id": "101"}
    payload.update(changes)
    return payload


def count(engine, table, **filters) -> int:
    with engine.connect() as connection:
        return int(connection.scalar(select(func.count()).select_from(table).filter_by(**filters)))


class TestCastVote:
    def test_accepts_one_anonymous_ballot_and_consumes_quota(self, client, voter_headers, engine):
        response = client.post(
            VOTES.format(election_id=OPEN_ELECTION), json=vote_payload(), headers=voter_headers
        )
        assert response.status_code == 201
        assert response.headers["cache-control"] == "no-store"
        assert response.headers.get("location") is None
        assert response.json()["data"] == {
            "election_id": str(OPEN_ELECTION),
            "accepted": True,
        }
        # participation + anonymous ballot + choice, written atomically (FR-09).
        assert count(engine, VoteParticipation, election_id=OPEN_ELECTION, user_id=21) == 1
        assert count(engine, Ballot, election_id=OPEN_ELECTION, voter_id=None) == 1
        with engine.connect() as connection:
            ballots = connection.execute(
                select(Ballot.id, Ballot.is_anonymous).where(Ballot.election_id == OPEN_ELECTION)
            ).all()
            assert len(ballots) == 1
            ballot_id, is_anonymous = ballots[0]
            assert is_anonymous is True
            choice = connection.execute(
                select(BallotChoice.candidate_id, BallotChoice.election_id).where(
                    BallotChoice.ballot_id == ballot_id
                )
            ).one()
            assert choice.candidate_id == 101
            assert choice.election_id == OPEN_ELECTION

    def test_second_vote_hits_exhausted_quota_without_new_ballot(
        self, client, voter_headers, engine
    ):
        first = client.post(
            VOTES.format(election_id=OPEN_ELECTION), json=vote_payload(), headers=voter_headers
        )
        assert first.status_code == 201
        second = client.post(
            VOTES.format(election_id=OPEN_ELECTION), json=vote_payload(), headers=voter_headers
        )
        assert second.status_code == 409
        assert second.json()["error"]["code"] == "VOTE_QUOTA_EXHAUSTED"
        assert count(engine, Ballot, election_id=OPEN_ELECTION) == 1
        assert count(engine, VoteParticipation, election_id=OPEN_ELECTION, user_id=21) == 1

    def test_two_members_vote_independently(self, client, voter_headers, voter2_headers, engine):
        for headers, candidate in ((voter_headers, "101"), (voter2_headers, "102")):
            response = client.post(
                VOTES.format(election_id=OPEN_ELECTION),
                json=vote_payload(candidate_id=candidate),
                headers=headers,
            )
            assert response.status_code == 201
        assert count(engine, Ballot, election_id=OPEN_ELECTION) == 2
        assert count(engine, VoteParticipation, election_id=OPEN_ELECTION, user_id=21) == 1
        assert count(engine, VoteParticipation, election_id=OPEN_ELECTION, user_id=23) == 1

    def test_unknown_or_cross_election_candidate_is_rejected(self, client, voter_headers, engine):
        for candidate_id in ("999999", "501"):  # 501 belongs to another election
            response = client.post(
                VOTES.format(election_id=OPEN_ELECTION),
                json=vote_payload(candidate_id=candidate_id),
                headers=voter_headers,
            )
            assert response.status_code == 400
            assert response.json()["error"]["code"] == "INVALID_CANDIDATE"
        assert count(engine, Ballot, election_id=OPEN_ELECTION) == 0
        assert count(engine, VoteParticipation, election_id=OPEN_ELECTION) == 0

    def test_non_member_is_rejected_before_state_checks(self, client, outsider_headers):
        response = client.post(
            VOTES.format(election_id=OPEN_ELECTION), json=vote_payload(), headers=outsider_headers
        )
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "NOT_ELIGIBLE"
        closed = client.post(
            VOTES.format(election_id=CLOSED_ELECTION),
            json=vote_payload(),
            headers=outsider_headers,
        )
        assert closed.json()["error"]["code"] == "NOT_ELIGIBLE"

    def test_admin_has_no_v1_voting_role(self, client, admin_headers):
        response = client.post(
            VOTES.format(election_id=OPEN_ELECTION), json=vote_payload(), headers=admin_headers
        )
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "PERMISSION_DENIED"

    def test_voting_requires_open_status_and_window(self, client, voter_headers, engine):
        expectations = [
            (DRAFT_ELECTION, "ELECTION_NOT_OPEN"),
            (CLOSED_ELECTION, "ELECTION_NOT_OPEN"),
            (NOT_STARTED_ELECTION, "VOTING_NOT_STARTED"),
            (ENDED_ELECTION, "VOTING_ENDED"),
        ]
        for election_id, code in expectations:
            response = client.post(
                VOTES.format(election_id=election_id),
                json=vote_payload(candidate_id="501"),
                headers=voter_headers,
            )
            assert response.status_code == 409
            assert response.json()["error"]["code"] == code
        assert count(engine, Ballot) == 0
        assert count(engine, VoteParticipation) == 0

    def test_authentication_is_required(self, client):
        response = client.post(VOTES.format(election_id=OPEN_ELECTION), json=vote_payload())
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"

    def test_rejects_malformed_and_extra_input(self, client, voter_headers, engine):
        requests = [
            vote_payload(candidate_id="0"),
            vote_payload(candidate_id="101", voter_id="21"),
            vote_payload(candidate_id=101),
            {},
        ]
        for payload in requests:
            response = client.post(
                VOTES.format(election_id=OPEN_ELECTION), json=payload, headers=voter_headers
            )
            assert response.status_code == 422, payload
            assert response.json()["error"]["code"] == "VALIDATION_ERROR"
        queried = client.post(
            VOTES.format(election_id=OPEN_ELECTION),
            json=vote_payload(),
            params={"dry_run": "1"},
            headers=voter_headers,
        )
        assert queried.status_code == 422
        assert count(engine, Ballot, election_id=OPEN_ELECTION) == 0
