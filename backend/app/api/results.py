from fastapi import APIRouter

from app.api.dependencies import CurrentUser, VotingServiceDep
from app.api.routing import StrictAPIRoute
from app.schemas.common import ID, DataResponse, ErrorResponse
from app.schemas.voting import ResultResponse

router = APIRouter(
    prefix="/elections",
    tags=["results"],
    route_class=StrictAPIRoute,
    responses={code: {"model": ErrorResponse} for code in (401, 403, 404, 409, 422, 500)},
)


@router.get("/{election_id}/results", response_model=DataResponse[ResultResponse])
def get_results(
    election_id: ID,
    service: VotingServiceDep,
    user: CurrentUser,
):
    """Recomputed tally for a closed election; USER reads require publication."""
    result = service.get_results(int(election_id), user)
    return DataResponse(data=ResultResponse.from_result(result))
