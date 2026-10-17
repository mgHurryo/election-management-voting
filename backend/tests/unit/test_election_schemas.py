import pytest
from pydantic import ValidationError

from app.schemas.elections import (
    CandidateCreateRequest,
    CandidatePatchRequest,
    ElectionCreateRequest,
    ElectionPatchRequest,
)


def election_payload(**changes):
    value = {
        "title": "Election",
        "position_title": "Chair",
        "starts_at": "2026-11-01T08:00:00+08:00",
        "ends_at": "2026-11-02T08:00:00+08:00",
        "voter_ids": ["21"],
    }
    value.update(changes)
    return value


def test_election_request_normalizes_titles_and_timestamps():
    request = ElectionCreateRequest.model_validate(election_payload(title=" Chair election "))
    assert request.title == "Chair election"
    assert request.starts_at.isoformat() == "2026-11-01T00:00:00+00:00"


@pytest.mark.parametrize(
    "payload",
    [
        election_payload(title=" "),
        election_payload(voter_ids=[]),
        election_payload(voter_ids=["21", "21"]),
        election_payload(starts_at="2026-11-01T00:00:00"),
        election_payload(created_by="22"),
    ],
)
def test_invalid_election_create_payloads_are_rejected(payload):
    with pytest.raises(ValidationError):
        ElectionCreateRequest.model_validate(payload)


@pytest.mark.parametrize("payload", [{}, {"title": None}, {"starts_at": None}])
def test_election_patch_requires_non_null_editable_fields(payload):
    with pytest.raises(ValidationError):
        ElectionPatchRequest.model_validate(payload)


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "Candidate", "description": "Bio", "photo_url": "http://x.invalid/a"},
        {"name": "Candidate", "description": "Bio", "display_order": True},
        {"name": "Candidate", "description": " "},
        {"name": "Candidate", "description": "Bio", "election_id": "1"},
    ],
)
def test_invalid_candidate_create_payloads_are_rejected(payload):
    with pytest.raises(ValidationError):
        CandidateCreateRequest.model_validate(payload)


@pytest.mark.parametrize("payload", [{}, {"name": None}, {"display_order": None}])
def test_candidate_patch_requires_at_least_one_non_null_nonnullable_field(payload):
    with pytest.raises(ValidationError):
        CandidatePatchRequest.model_validate(payload)


def test_candidate_patch_can_clear_optional_photo():
    request = CandidatePatchRequest.model_validate({"photo_url": None})
    assert request.photo_url is None
    assert request.model_fields_set == {"photo_url"}
