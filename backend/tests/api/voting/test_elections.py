from datetime import UTC, datetime

from sqlalchemy import func, insert, select, update

from app.models import Ballot, BallotChoice, Election, ElectionVoter
from tests.api.voting.conftest import (
    CLOSED_ELECTION,
    DRAFT_ELECTION,
    ENDED_ELECTION,
    NOT_STARTED_ELECTION,
    OPEN_ELECTION,
)

ELECTIONS = "/api/v1/elections"


def create_payload(**changes):
    payload = {
        "title": "New Election",
        "position_title": "Chair",
        "description": None,
        "starts_at": "2026-11-01T00:00:00Z",
        "ends_at": "2026-11-02T00:00:00Z",
        "voter_ids": ["21"],
    }
    payload.update(changes)
    return payload


def candidate_payload(**changes):
    payload = {
        "name": "Candidate C",
        "description": "Candidate introduction.",
        "photo_url": None,
        "display_order": 0,
    }
    payload.update(changes)
    return payload


class TestElectionRead:
    def test_admin_lists_all_and_filters_status(self, client, admin_headers):
        response = client.get(ELECTIONS, params={"status": "OPEN"}, headers=admin_headers)
        assert response.status_code == 200
        assert [row["id"] for row in response.json()["data"]] == ["4004", "3003", "2002"]
        assert response.json()["meta"]["total"] == 3

    def test_user_list_is_limited_to_membership_or_published(self, client, voter_headers, engine):
        response = client.get(ELECTIONS, headers=voter_headers)
        assert response.status_code == 200
        assert {row["id"] for row in response.json()["data"]} == {
            "1001",
            "2002",
            "3003",
            "4004",
            "5005",
        }

        with engine.begin() as connection:
            connection.execute(
                update(Election)
                .where(Election.id == DRAFT_ELECTION)
                .values(results_published_at=datetime(2026, 10, 1))
            )
            connection.execute(
                insert(Election).values(
                    id=6006,
                    title="Published Election",
                    position_title="Chair",
                    created_by=22,
                    status="CLOSED",
                    privacy_mode="FORCED_ANONYMOUS",
                    starts_at=datetime(2026, 11, 1),
                    ends_at=datetime(2026, 11, 2),
                    results_published_at=datetime(2026, 10, 1),
                )
            )
        response = client.get(ELECTIONS, headers=voter_headers)
        assert "6006" in {row["id"] for row in response.json()["data"]}

    def test_user_cannot_read_unrelated_unpublished_election(self, client, outsider_headers):
        response = client.get(f"{ELECTIONS}/{DRAFT_ELECTION}", headers=outsider_headers)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "ELECTION_NOT_FOUND"

    def test_user_can_read_election_on_own_roster(self, client, voter_headers):
        response = client.get(f"{ELECTIONS}/{DRAFT_ELECTION}", headers=voter_headers)
        assert response.status_code == 200
        assert response.json()["data"]["id"] == str(DRAFT_ELECTION)

    def test_list_rejects_invalid_filters_pagination_and_unknown_query(self, client, admin_headers):
        for params in (
            {"status": "PUBLISHED"},
            {"page": 0},
            {"page_size": 101},
            {"debug": "1"},
        ):
            response = client.get(ELECTIONS, params=params, headers=admin_headers)
            assert response.status_code == 422
            assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_election_reads_require_authentication(self, client):
        assert client.get(ELECTIONS).status_code == 401
        assert client.get(f"{ELECTIONS}/{DRAFT_ELECTION}").status_code == 401


class TestElectionCreateAndEdit:
    def test_admin_creates_election_and_initial_roster_atomically(
        self, client, admin_headers, engine
    ):
        response = client.post(ELECTIONS, json=create_payload(), headers=admin_headers)
        assert response.status_code == 201
        created = response.json()["data"]
        assert created["status"] == "DRAFT"
        assert created["created_by"] == "22"
        assert created["privacy_mode"] == "FORCED_ANONYMOUS"
        with engine.connect() as connection:
            election_id = int(created["id"])
            assert (
                connection.scalar(
                    select(ElectionVoter.user_id).where(ElectionVoter.election_id == election_id)
                )
                == 21
            )

    def test_invalid_roster_user_does_not_create_partial_election(
        self, client, admin_headers, engine
    ):
        response = client.post(
            ELECTIONS,
            json=create_payload(voter_ids=["21", "99999"]),
            headers=admin_headers,
        )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "USER_NOT_FOUND"
        with engine.connect() as connection:
            assert (
                connection.scalar(
                    select(func.count())
                    .select_from(Election)
                    .where(Election.title == "New Election")
                )
                == 0
            )

    def test_admin_account_cannot_be_added_as_voter(self, client, admin_headers):
        response = client.post(
            ELECTIONS, json=create_payload(voter_ids=["22"]), headers=admin_headers
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_VOTER"

    def test_create_rejects_invalid_range_duplicate_roster_and_extra_fields(
        self, client, admin_headers
    ):
        cases = [
            (create_payload(ends_at="2026-11-01T00:00:00Z"), "INVALID_TIME_RANGE"),
            (create_payload(voter_ids=["21", "21"]), "VALIDATION_ERROR"),
            (create_payload(created_by="22"), "VALIDATION_ERROR"),
            (create_payload(privacy_mode="IDENTIFIED"), "PRIVACY_MODE_VIOLATION"),
        ]
        for payload, code in cases:
            response = client.post(ELECTIONS, json=payload, headers=admin_headers)
            assert response.status_code in (400, 422)
            assert response.json()["error"]["code"] == code

    def test_only_admin_can_create_or_edit(self, client, voter_headers):
        response = client.post(ELECTIONS, json=create_payload(), headers=voter_headers)
        assert response.status_code == 403
        response = client.patch(
            f"{ELECTIONS}/{DRAFT_ELECTION}", json={"title": "changed"}, headers=voter_headers
        )
        assert response.status_code == 403

    def test_admin_updates_only_draft_fields_and_validates_merged_range(
        self, client, admin_headers
    ):
        response = client.patch(
            f"{ELECTIONS}/{DRAFT_ELECTION}",
            json={"description": None, "title": "Updated election"},
            headers=admin_headers,
        )
        assert response.status_code == 200
        assert response.json()["data"]["title"] == "Updated election"
        assert response.json()["data"]["description"] is None

        response = client.patch(
            f"{ELECTIONS}/{DRAFT_ELECTION}",
            json={"ends_at": "2026-10-31T00:00:00Z"},
            headers=admin_headers,
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_TIME_RANGE"

    def test_open_and_closed_elections_cannot_be_edited(self, client, admin_headers):
        for election_id in (OPEN_ELECTION, CLOSED_ELECTION):
            response = client.patch(
                f"{ELECTIONS}/{election_id}",
                json={"title": "changed"},
                headers=admin_headers,
            )
            assert response.status_code == 409
            assert response.json()["error"]["code"] == "ELECTION_NOT_EDITABLE"


class TestCandidateManagement:
    def test_candidate_crud_derives_position_from_election(self, client, admin_headers):
        response = client.post(
            f"{ELECTIONS}/{DRAFT_ELECTION}/candidates",
            json=candidate_payload(photo_url="https://example.invalid/candidate.png"),
            headers=admin_headers,
        )
        assert response.status_code == 201
        candidate = response.json()["data"]
        assert candidate["position_title"] == "Class President"
        assert candidate["photo_url"] == "https://example.invalid/candidate.png"

        response = client.patch(
            f"{ELECTIONS}/{DRAFT_ELECTION}/candidates/{candidate['id']}",
            json={"display_order": 4, "photo_url": None},
            headers=admin_headers,
        )
        assert response.status_code == 200
        assert response.json()["data"]["display_order"] == 4
        assert response.json()["data"]["photo_url"] is None

        response = client.delete(
            f"{ELECTIONS}/{DRAFT_ELECTION}/candidates/{candidate['id']}",
            headers=admin_headers,
        )
        assert response.status_code == 204
        assert response.content == b""

    def test_candidate_validation_and_candidate_id_scope(self, client, admin_headers):
        for payload in (
            candidate_payload(name="  "),
            candidate_payload(description=""),
            candidate_payload(photo_url="http://example.invalid/photo.png"),
            candidate_payload(display_order=True),
            {**candidate_payload(), "election_id": str(DRAFT_ELECTION)},
        ):
            response = client.post(
                f"{ELECTIONS}/{DRAFT_ELECTION}/candidates",
                json=payload,
                headers=admin_headers,
            )
            assert response.status_code == 422

        response = client.patch(
            f"{ELECTIONS}/{DRAFT_ELECTION}/candidates/101",
            json={"name": "cross-election"},
            headers=admin_headers,
        )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "CANDIDATE_NOT_FOUND"

    def test_candidate_delete_rejects_existing_ballot_reference(
        self, client, admin_headers, engine
    ):
        response = client.post(
            f"{ELECTIONS}/{DRAFT_ELECTION}/candidates",
            json=candidate_payload(),
            headers=admin_headers,
        )
        candidate_id = int(response.json()["data"]["id"])
        with engine.begin() as connection:
            connection.execute(
                insert(Ballot).values(
                    id=9001,
                    election_id=DRAFT_ELECTION,
                    voter_id=None,
                    is_anonymous=True,
                    submitted_at=datetime(2026, 10, 1),
                )
            )
            connection.execute(
                insert(BallotChoice).values(
                    id=9001,
                    election_id=DRAFT_ELECTION,
                    ballot_id=9001,
                    candidate_id=candidate_id,
                )
            )
        response = client.delete(
            f"{ELECTIONS}/{DRAFT_ELECTION}/candidates/{candidate_id}",
            headers=admin_headers,
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "RESOURCE_CONFLICT"

    def test_voter_candidate_read_requires_eligibility_open_state_and_time_window(
        self, client, admin_headers, voter_headers, outsider_headers
    ):
        admin_response = client.get(
            f"{ELECTIONS}/{NOT_STARTED_ELECTION}/candidates", headers=admin_headers
        )
        assert admin_response.status_code == 200

        response = client.get(f"{ELECTIONS}/{OPEN_ELECTION}/candidates", headers=voter_headers)
        assert response.status_code == 200
        assert response.json()["data"][0]["position_title"] == "Class Representative"

        response = client.get(f"{ELECTIONS}/{OPEN_ELECTION}/candidates", headers=outsider_headers)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "NOT_ELIGIBLE"

        response = client.get(f"{ELECTIONS}/{CLOSED_ELECTION}/candidates", headers=voter_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "ELECTION_NOT_OPEN"

        response = client.get(
            f"{ELECTIONS}/{NOT_STARTED_ELECTION}/candidates", headers=voter_headers
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VOTING_NOT_STARTED"

        response = client.get(f"{ELECTIONS}/{ENDED_ELECTION}/candidates", headers=voter_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VOTING_ENDED"

    def test_candidates_cannot_be_changed_after_open(self, client, admin_headers):
        response = client.post(
            f"{ELECTIONS}/{OPEN_ELECTION}/candidates",
            json=candidate_payload(),
            headers=admin_headers,
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "ELECTION_NOT_EDITABLE"


class TestElectionLifecycle:
    def test_open_requires_candidate_voter_and_inclusive_time_window(
        self, client, admin_headers, engine
    ):
        election_service = client.app.state.container.elections
        election_service._clock = lambda: datetime(2026, 11, 1, tzinfo=UTC)

        response = client.post(f"{ELECTIONS}/{DRAFT_ELECTION}/open", headers=admin_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "ELECTION_NOT_READY"

        client.post(
            f"{ELECTIONS}/{DRAFT_ELECTION}/candidates",
            json=candidate_payload(),
            headers=admin_headers,
        )
        response = client.post(f"{ELECTIONS}/{DRAFT_ELECTION}/open", headers=admin_headers)
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "OPEN"

        response = client.post(f"{ELECTIONS}/{DRAFT_ELECTION}/open", headers=admin_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "INVALID_STATE_TRANSITION"

        response = client.post(f"{ELECTIONS}/{DRAFT_ELECTION}/close", headers=admin_headers)
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "CLOSED"

        response = client.post(f"{ELECTIONS}/{DRAFT_ELECTION}/open", headers=admin_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "INVALID_STATE_TRANSITION"

    def test_open_rejects_before_and_after_window(self, client, admin_headers):
        client.post(
            f"{ELECTIONS}/{DRAFT_ELECTION}/candidates",
            json=candidate_payload(),
            headers=admin_headers,
        )
        election_service = client.app.state.container.elections
        election_service._clock = lambda: datetime(2026, 10, 31, 23, 59, 59, tzinfo=UTC)
        response = client.post(f"{ELECTIONS}/{DRAFT_ELECTION}/open", headers=admin_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VOTING_NOT_STARTED"

        election_service._clock = lambda: datetime(2026, 11, 2, 0, 0, 1, tzinfo=UTC)
        response = client.post(f"{ELECTIONS}/{DRAFT_ELECTION}/open", headers=admin_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VOTING_ENDED"

    def test_close_requires_open_state_and_all_lifecycle_ops_require_admin(
        self, client, admin_headers, voter_headers
    ):
        response = client.post(f"{ELECTIONS}/{DRAFT_ELECTION}/close", headers=admin_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "INVALID_STATE_TRANSITION"
        for action in ("open", "close"):
            response = client.post(f"{ELECTIONS}/{OPEN_ELECTION}/{action}", headers=voter_headers)
            assert response.status_code == 403

    def test_bodyless_lifecycle_endpoints_reject_json(self, client, admin_headers):
        response = client.post(f"{ELECTIONS}/{OPEN_ELECTION}/close", json={}, headers=admin_headers)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"
