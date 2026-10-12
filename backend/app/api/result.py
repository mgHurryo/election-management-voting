"""M7 result endpoints: API.md 4.19 (count and read) and 4.20 (publish).

Service-layer contract expected by this module (the current
``ResultService`` does not provide it yet; see the M7 handoff notes):

- ``get_results(election_id, viewer_role)`` returns an object/dict with
  ``election_id``, ``position_title``, ``results_published_at``
  (datetime or None) and ``candidates`` — a list of
  ``{candidate_id, name, vote_count}`` including zero votes, sorted by
  vote_count descending, then display_order and numeric id. It raises
  ``AppError`` for ELECTION_NOT_FOUND / ELECTION_NOT_CLOSED (ADMIN) /
  RESULTS_NOT_PUBLISHED (USER).
- ``publish_results(election_id)`` returns the same shape after an
  idempotent, row-locked publication and raises
  ELECTION_NOT_CLOSED / RESULT_NOT_DECIDED otherwise.
"""

from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict

from app.api.dependencies import AdminUser, CurrentUser
from app.api.routing import StrictAPIRoute
from app.schemas.common import ID, DataResponse, ErrorResponse, Timestamp
from app.services.result_service import ResultService

router = APIRouter(
    prefix="/elections/{election_id}/results",
    tags=["results"],
    route_class=StrictAPIRoute,
    responses={code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409, 422, 500)},
)


def result_service(request: Request) -> Iterator[ResultService]:
    """Session-scoped service until the container wires ResultService like its peers."""
    session = request.app.state.container.session_factory()
    try:
        yield ResultService(session)
    finally:
        session.close()


ResultServiceDep = Annotated[ResultService, Depends(result_service)]


class CandidateTally(BaseModel):
    """One candidate's count as reported by the service layer."""

    model_config = ConfigDict(from_attributes=True)

    candidate_id: int
    name: str
    vote_count: int


class ElectionResult(BaseModel):
    """Service payload the wire response below is derived from."""

    model_config = ConfigDict(from_attributes=True)

    election_id: int
    position_title: str
    results_published_at: datetime | None
    candidates: list[CandidateTally]

    @property
    def total_votes(self) -> int:
        return sum(entry.vote_count for entry in self.candidates)

    @property
    def winner_candidate_id(self) -> int | None:
        # Unique highest positive vote only; ties and zero votes stay undecided.
        top = max((entry.vote_count for entry in self.candidates), default=0)
        if top <= 0:
            return None
        winners = [entry for entry in self.candidates if entry.vote_count == top]
        return winners[0].candidate_id if len(winners) == 1 else None


class CandidateResultResponse(BaseModel):
    candidate_id: ID
    name: str
    vote_count: int


class ResultResponse(BaseModel):
    election_id: ID
    position_title: str
    results_published_at: Timestamp | None
    total_votes: int
    candidates: list[CandidateResultResponse]
    winner_candidate_id: ID | None

    @classmethod
    def from_result(cls, result: ElectionResult) -> "ResultResponse":
        published_at = result.results_published_at
        if published_at is not None and published_at.tzinfo is None:
            # DB datetimes are timezone-naive UTC (MySQL DATETIME convention).
            published_at = published_at.replace(tzinfo=UTC)
        winner = result.winner_candidate_id
        return cls(
            election_id=str(result.election_id),
            position_title=result.position_title,
            results_published_at=published_at,
            total_votes=result.total_votes,
            candidates=[
                CandidateResultResponse(
                    candidate_id=str(entry.candidate_id),
                    name=entry.name,
                    vote_count=entry.vote_count,
                )
                for entry in result.candidates
            ],
            winner_candidate_id=str(winner) if winner is not None else None,
        )


@router.get("", response_model=DataResponse[ResultResponse])
def count_results(
    election_id: ID,
    user: CurrentUser,
    service: ResultServiceDep,
):
    # Auth resolves before the service dependency so 401 is never masked by a 500.
    # ADMIN recounts any CLOSED election; USER only reads a published result (API.md 4.19).
    result = ElectionResult.model_validate(service.get_results(int(election_id), user.role))
    return DataResponse(data=ResultResponse.from_result(result))


@router.post("/publish", response_model=DataResponse[ResultResponse])
def publish_results(
    election_id: ID,
    admin: AdminUser,
    service: ResultServiceDep,
):
    result = ElectionResult.model_validate(service.publish_results(int(election_id)))
    return DataResponse(data=ResultResponse.from_result(result))
