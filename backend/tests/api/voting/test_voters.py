"""M2 voter roll tests: API.md 4.13 (list), 4.14 (add), 4.15 (remove).

Owner: backend developer F. Covers FR-04 / FR-07 and BR-01 / BR-05.
Until the voters router is implemented these tests fail with 404
ROUTE_NOT_FOUND; that is the expected red state of test-first development.
"""

import pytest
from sqlalchemy import insert, select

from app.models import ElectionVoter, VoteParticipation
from tests.api.voting.conftest import (
    CLOSED_ELECTION,
    DRAFT_ELECTION,
    OPEN_ELECTION,
)

VOTERS = "/api/v1/elections/{election_id}/voters"


def voter_path(election_id: int, user_id: int | None = None) -> str:
    path = VOTERS.format(election_id=election_id)
    return f"{path}/{user_id}" if user_id is not None else path


class TestVoterRollListing:
    """API.md 4.13 — GET /api/v1/elections/{election_id}/voters (ADMIN)."""

    def test_admin_lists_roster_with_contract_fields(self, client, admin_headers):
        response = client.get(voter_path(OPEN_ELECTION), headers=admin_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["meta"] == {"page": 1, "page_size": 20, "total": 2}
        # Sorted by numeric user_id ascending.
        assert [entry["user_id"] for entry in body["data"]] == ["21", "23"]
        assert body["data"][0] == {
            "election_id": "2002",
            "user_id": "21",
            "display_name": "Demo Voter",
            "vote_quota": 1,
            "created_at": "2026-10-01T00:00:00Z",
            "updated_at": "2026-10-01T00:00:00Z",
        }

    def test_pagination_slices_and_keeps_true_total(self, client, admin_headers):
        response = client.get(
            voter_path(OPEN_ELECTION), params={"page": 2, "page_size": 1}, headers=admin_headers
        )
        assert response.status_code == 200
        body = response.json()
        assert [entry["user_id"] for entry in body["data"]] == ["23"]
        assert body["meta"] == {"page": 2, "page_size": 1, "total": 2}

    def test_page_beyond_end_returns_empty_data_with_total(self, client, admin_headers):
        response = client.get(voter_path(OPEN_ELECTION), params={"page": 99}, headers=admin_headers)
        assert response.status_code == 200
        assert response.json()["data"] == []
        assert response.json()["meta"]["total"] == 2

    @pytest.mark.parametrize("params", [{"page": 0}, {"page_size": 0}, {"page_size": 101}])
    def test_invalid_pagination_is_rejected(self, client, admin_headers, params):
        response = client.get(voter_path(OPEN_ELECTION), params=params, headers=admin_headers)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_unknown_election_returns_election_not_found(self, client, admin_headers):
        response = client.get(voter_path(999999), headers=admin_headers)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "ELECTION_NOT_FOUND"

    def test_listing_works_in_any_election_state(self, client, admin_headers):
        # Any state, including CLOSED, is allowed for the roster read.
        response = client.get(voter_path(CLOSED_ELECTION), headers=admin_headers)
        assert response.status_code == 200
        assert response.json()["meta"]["total"] == 1

    def test_user_role_cannot_list_roster(self, client, voter_headers):
        response = client.get(voter_path(OPEN_ELECTION), headers=voter_headers)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "PERMISSION_DENIED"

    def test_unauthenticated_request_is_rejected(self, client):
        response = client.get(voter_path(OPEN_ELECTION))
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"

    def test_unknown_query_field_is_rejected(self, client, admin_headers):
        response = client.get(
            voter_path(OPEN_ELECTION), params={"debug": "true"}, headers=admin_headers
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"


class TestAddVoter:
    """API.md 4.14 — POST /api/v1/elections/{election_id}/voters (ADMIN, DRAFT only)."""

    def test_admin_adds_active_user_to_draft_election(self, client, admin_headers):
        response = client.post(
            voter_path(DRAFT_ELECTION),
            json={"user_id": "24", "vote_quota": 1},
            headers=admin_headers,
        )
        assert response.status_code == 201
        data = response.json()["data"]
        # created_at/updated_at are server-generated; check the stable fields.
        stable = ("election_id", "user_id", "display_name", "vote_quota")
        assert {key: data[key] for key in stable} == {
            "election_id": "1001",
            "user_id": "24",
            "display_name": "Outsider",
            "vote_quota": 1,
        }
        assert data["created_at"].endswith("Z")
        assert data["updated_at"].endswith("Z")

    def test_omitted_quota_defaults_to_one_and_persists_membership(
        self, client, admin_headers, engine
    ):
        response = client.post(
            voter_path(DRAFT_ELECTION), json={"user_id": "24"}, headers=admin_headers
        )
        assert response.status_code == 201
        data = response.json()["data"]
        assert data["user_id"] == "24"
        assert data["vote_quota"] == 1
        with engine.connect() as connection:
            quota = connection.scalar(
                select(ElectionVoter.vote_quota).where(
                    ElectionVoter.election_id == DRAFT_ELECTION, ElectionVoter.user_id == 24
                )
            )
        assert quota == 1

    def test_openapi_declares_quota_optional_with_default_one(self, client):
        schema = client.get("/openapi.json").json()["components"]["schemas"]["VoterCreate"]
        assert schema["required"] == ["user_id"]
        assert schema["properties"]["vote_quota"]["default"] == 1

    def test_duplicate_membership_returns_conflict_without_second_row(
        self, client, admin_headers, engine
    ):
        response = client.post(
            voter_path(DRAFT_ELECTION), json={"user_id": "21"}, headers=admin_headers
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "VOTER_ALREADY_EXISTS"
        with engine.begin() as connection:
            rows = connection.execute(
                select(ElectionVoter.user_id).where(ElectionVoter.election_id == DRAFT_ELECTION)
            ).all()
        assert rows == [(21,)]

    def test_quota_other_than_one_is_rejected(self, client, admin_headers):
        response = client.post(
            voter_path(DRAFT_ELECTION),
            json={"user_id": "24", "vote_quota": 2},
            headers=admin_headers,
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_unknown_account_returns_user_not_found(self, client, admin_headers):
        response = client.post(
            voter_path(DRAFT_ELECTION), json={"user_id": "999"}, headers=admin_headers
        )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "USER_NOT_FOUND"

    def test_disabled_account_is_invalid_voter(self, client, admin_headers):
        response = client.post(
            voter_path(DRAFT_ELECTION), json={"user_id": "25"}, headers=admin_headers
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_VOTER"

    def test_admin_account_is_invalid_voter(self, client, admin_headers):
        # ADMIN has no voting role in v1.
        response = client.post(
            voter_path(DRAFT_ELECTION), json={"user_id": "22"}, headers=admin_headers
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_VOTER"

    @pytest.mark.parametrize("election_id", [OPEN_ELECTION, CLOSED_ELECTION])
    def test_adding_requires_draft_state(self, client, admin_headers, election_id):
        response = client.post(
            voter_path(election_id), json={"user_id": "24"}, headers=admin_headers
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "ELECTION_NOT_EDITABLE"

    def test_user_role_cannot_add_voters(self, client, voter_headers):
        response = client.post(
            voter_path(DRAFT_ELECTION), json={"user_id": "24"}, headers=voter_headers
        )
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "PERMISSION_DENIED"

    @pytest.mark.parametrize(
        "body",
        [
            pytest.param({"user_id": 24}, id="numeric-user-id"),
            {"user_id": "24", "note": "extra"},
            {"user_id": "24", "vote_quota": "1"},
            {},
            {"user_id": "0"},
            {"user_id": "-1"},
        ],
    )
    def test_input_allowlist_and_id_string_type(self, client, admin_headers, body):
        response = client.post(voter_path(DRAFT_ELECTION), json=body, headers=admin_headers)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_unauthenticated_add_is_rejected(self, client):
        response = client.post(voter_path(DRAFT_ELECTION), json={"user_id": "24"})
        assert response.status_code == 401


class TestRemoveVoter:
    """API.md 4.15 — DELETE /api/v1/elections/{election_id}/voters/{user_id}."""

    def test_admin_removes_membership_with_no_content(self, client, admin_headers):
        response = client.delete(voter_path(DRAFT_ELECTION, 21), headers=admin_headers)
        assert response.status_code == 204
        assert response.content == b""
        listing = client.get(voter_path(DRAFT_ELECTION), headers=admin_headers)
        assert listing.json()["meta"]["total"] == 0

    def test_removing_missing_membership_returns_voter_not_found(self, client, admin_headers):
        response = client.delete(voter_path(DRAFT_ELECTION, 24), headers=admin_headers)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "VOTER_NOT_FOUND"

    def test_repeat_removal_returns_voter_not_found(self, client, admin_headers):
        first = client.delete(voter_path(DRAFT_ELECTION, 21), headers=admin_headers)
        assert first.status_code == 204
        response = client.delete(voter_path(DRAFT_ELECTION, 21), headers=admin_headers)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "VOTER_NOT_FOUND"

    @pytest.mark.parametrize("election_id", [OPEN_ELECTION, CLOSED_ELECTION])
    def test_removal_requires_draft_state(self, client, admin_headers, election_id):
        response = client.delete(voter_path(election_id, 21), headers=admin_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "ELECTION_NOT_EDITABLE"

    def test_removal_with_existing_participation_conflicts(self, client, admin_headers, engine):
        # Participation rows cannot exist in DRAFT through the API; seed one directly.
        with engine.begin() as connection:
            connection.execute(
                insert(VoteParticipation).values(
                    id=1, election_id=DRAFT_ELECTION, user_id=21, vote_sequence=1
                )
            )
        response = client.delete(voter_path(DRAFT_ELECTION, 21), headers=admin_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "RESOURCE_CONFLICT"

    def test_unknown_election_returns_election_not_found(self, client, admin_headers):
        response = client.delete(voter_path(999999, 21), headers=admin_headers)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "ELECTION_NOT_FOUND"

    def test_user_role_cannot_remove_voters(self, client, voter_headers):
        response = client.delete(voter_path(DRAFT_ELECTION, 21), headers=voter_headers)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "PERMISSION_DENIED"

    def test_unauthenticated_removal_is_rejected(self, client):
        response = client.delete(voter_path(DRAFT_ELECTION, 21))
        assert response.status_code == 401
