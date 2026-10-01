from fastapi import APIRouter

from app.api.dependencies import CurrentUser, IdentityServiceDep
from app.api.routing import StrictAPIRoute
from app.schemas.common import DataResponse, ErrorResponse
from app.schemas.identity import LoginRequest, TokenResponse, UserResponse

router = APIRouter(
    prefix="/auth",
    tags=["identity"],
    route_class=StrictAPIRoute,
    responses={status: {"model": ErrorResponse} for status in (401, 403, 422, 500)},
)


@router.post("/login", response_model=DataResponse[TokenResponse])
def login(body: LoginRequest, service: IdentityServiceDep):
    result = service.login(body.username, body.password)
    return DataResponse(
        data=TokenResponse(
            access_token=result.access_token,
            expires_in=result.expires_in,
            user=UserResponse.from_identity(result.user),
        )
    )


@router.get("/me", response_model=DataResponse[UserResponse])
def me(user: CurrentUser):
    return DataResponse(data=UserResponse.from_identity(user))
