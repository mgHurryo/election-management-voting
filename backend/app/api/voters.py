from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.dependencies import AdminUser, RosterServiceDep
from app.api.routing import StrictAPIRoute
from app.schemas.common import (
    ID,
    DataResponse,
    ErrorResponse,
    PaginatedResponse,
    PaginationMeta,
)
from app.schemas.roster import VoterCreate, VoterResponse

router = APIRouter(
    prefix="/elections/{election_id}/voters",
    tags=["voter-roll"],
    route_class=StrictAPIRoute,
    responses={code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409, 422, 500)},
)


@router.get("", response_model=PaginatedResponse[VoterResponse])
def list_voters(
    election_id: ID,
    service: RosterServiceDep,
    admin: AdminUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    memberships, total = service.list_voters(int(election_id), page, page_size)
    return PaginatedResponse(
        data=[VoterResponse.from_membership(membership) for membership in memberships],
        meta=PaginationMeta(page=page, page_size=page_size, total=total),
    )


@router.post(
    "",
    response_model=DataResponse[VoterResponse],
    status_code=status.HTTP_201_CREATED,
)
def add_voter(
    election_id: ID,
    body: VoterCreate,
    service: RosterServiceDep,
    admin: AdminUser,
):
    membership = service.add_voter(int(election_id), int(body.user_id), body.vote_quota)
    return DataResponse(data=VoterResponse.from_membership(membership))


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_voter(
    election_id: ID,
    user_id: ID,
    service: RosterServiceDep,
    admin: AdminUser,
):
    service.remove_voter(int(election_id), int(user_id))
