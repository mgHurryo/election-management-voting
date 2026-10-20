from fastapi import APIRouter

from app.api.dependencies import VoterUser, VotingServiceDep
from app.api.routing import StrictAPIRoute
from app.schemas.common import ID, DataResponse, ErrorResponse
from app.schemas.voting import BallotViewResponse, ParticipationResponse

router = APIRouter(
    prefix="/elections",
    tags=["voting"],
    route_class=StrictAPIRoute,
    responses={code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409, 422, 500)},
)


@router.get("/{election_id}/ballot", response_model=DataResponse[BallotViewResponse])
def get_ballot(
    election_id: ID,
    service: VotingServiceDep,
    voter: VoterUser,
):
    """One eligible voter's full ballot view; never exposes stored choices."""
    view = service.get_ballot(int(election_id), voter)
    return DataResponse(data=BallotViewResponse.from_view(view))


@router.get(
    "/{election_id}/participation", response_model=DataResponse[ParticipationResponse]
)
def get_participation(
    election_id: ID,
    service: VotingServiceDep,
    voter: VoterUser,
):
    """The caller's own eligibility and quota usage, for any election state."""
    participation = service.get_participation(int(election_id), voter)
    return DataResponse(data=ParticipationResponse.from_status(participation))
