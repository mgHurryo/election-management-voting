from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response, status

from app.api.dependencies import AdminUser, CurrentUser, ElectionsServiceDep
from app.api.routing import StrictAPIRoute
from app.schemas.common import (
    ID,
    DataResponse,
    ErrorResponse,
    PaginatedResponse,
    PaginationMeta,
)
from app.schemas.elections import (
    CandidateCreateRequest,
    CandidatePatchRequest,
    CandidateResponse,
    ElectionCreateRequest,
    ElectionPatchRequest,
    ElectionResponse,
)

router = APIRouter(
    prefix="/elections",
    tags=["elections"],
    route_class=StrictAPIRoute,
    responses={code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409, 422, 500)},
)


@router.get("", response_model=PaginatedResponse[ElectionResponse])
def list_elections(
    service: ElectionsServiceDep,
    user: CurrentUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    election_status: Annotated[
        Literal["DRAFT", "OPEN", "CLOSED"] | None, Query(alias="status")
    ] = None,
):
    elections, total = service.list_elections(user, page, page_size, election_status)
    return PaginatedResponse(
        data=[ElectionResponse.from_election(election) for election in elections],
        meta=PaginationMeta(page=page, page_size=page_size, total=total),
    )


@router.post("", response_model=DataResponse[ElectionResponse], status_code=status.HTTP_201_CREATED)
def create_election(
    body: ElectionCreateRequest,
    service: ElectionsServiceDep,
    admin: AdminUser,
):
    """Create a draft election and its initial roster in one transaction."""
    election = service.create_election(body, admin.id)
    return DataResponse(data=ElectionResponse.from_election(election))


@router.get("/{election_id}", response_model=DataResponse[ElectionResponse])
def get_election(
    election_id: ID,
    service: ElectionsServiceDep,
    user: CurrentUser,
):
    election = service.get_election(int(election_id), user)
    return DataResponse(data=ElectionResponse.from_election(election))


@router.patch("/{election_id}", response_model=DataResponse[ElectionResponse])
def update_election(
    election_id: ID,
    body: ElectionPatchRequest,
    service: ElectionsServiceDep,
    admin: AdminUser,
):
    changes = {field_name: getattr(body, field_name) for field_name in body.model_fields_set}
    election = service.update_election(int(election_id), changes)
    return DataResponse(data=ElectionResponse.from_election(election))


@router.post("/{election_id}/open", response_model=DataResponse[ElectionResponse])
def open_election(
    election_id: ID,
    service: ElectionsServiceDep,
    admin: AdminUser,
):
    """Open only after readiness and the configured time window are verified."""
    election = service.open_election(int(election_id))
    return DataResponse(data=ElectionResponse.from_election(election))


@router.post("/{election_id}/close", response_model=DataResponse[ElectionResponse])
def close_election(
    election_id: ID,
    service: ElectionsServiceDep,
    admin: AdminUser,
):
    election = service.close_election(int(election_id))
    return DataResponse(data=ElectionResponse.from_election(election))


@router.get(
    "/{election_id}/candidates",
    response_model=PaginatedResponse[CandidateResponse],
)
def list_candidates(
    election_id: ID,
    service: ElectionsServiceDep,
    user: CurrentUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    candidates, total = service.list_candidates(int(election_id), user, page, page_size)
    return PaginatedResponse(
        data=[CandidateResponse.from_candidate(candidate) for candidate in candidates],
        meta=PaginationMeta(page=page, page_size=page_size, total=total),
    )


@router.post(
    "/{election_id}/candidates",
    response_model=DataResponse[CandidateResponse],
    status_code=status.HTTP_201_CREATED,
)
def add_candidate(
    election_id: ID,
    body: CandidateCreateRequest,
    service: ElectionsServiceDep,
    admin: AdminUser,
):
    candidate = service.add_candidate(
        int(election_id),
        name=body.name,
        description=body.description,
        photo_url=body.photo_url,
        display_order=body.display_order,
    )
    return DataResponse(data=CandidateResponse.from_candidate(candidate))


@router.patch(
    "/{election_id}/candidates/{candidate_id}",
    response_model=DataResponse[CandidateResponse],
)
def update_candidate(
    election_id: ID,
    candidate_id: ID,
    body: CandidatePatchRequest,
    service: ElectionsServiceDep,
    admin: AdminUser,
):
    candidate = service.update_candidate(
        int(election_id),
        int(candidate_id),
        {field_name: getattr(body, field_name) for field_name in body.model_fields_set},
    )
    return DataResponse(data=CandidateResponse.from_candidate(candidate))


@router.delete(
    "/{election_id}/candidates/{candidate_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_candidate(
    election_id: ID,
    candidate_id: ID,
    service: ElectionsServiceDep,
    admin: AdminUser,
) -> Response:
    service.delete_candidate(int(election_id), int(candidate_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
