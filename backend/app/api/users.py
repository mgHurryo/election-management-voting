from typing import Annotated

from fastapi import APIRouter, Query

from app.api.dependencies import AdminUser, IdentityServiceDep
from app.schemas.common import PaginatedResponse, PaginationMeta
from app.schemas.identity import VoterOptionResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/eligible-voters", response_model=PaginatedResponse[VoterOptionResponse])
def list_eligible_voters(
    service: IdentityServiceDep,
    _admin: AdminUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 100,
):
    """Return only IDs and display names for active voter accounts to administrators."""
    users, total = service.list_active_voters(page, page_size)
    return PaginatedResponse(
        data=[VoterOptionResponse.from_identity(user) for user in users],
        meta=PaginationMeta(page=page, page_size=page_size, total=total),
    )
