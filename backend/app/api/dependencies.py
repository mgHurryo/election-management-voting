from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import authentication_required
from app.models.identity import UserIdentity
from app.services.health import HealthService
from app.services.identity import IdentityService

bearer = HTTPBearer(auto_error=False)


def identity_service(request: Request) -> IdentityService:
    return request.app.state.container.identity


def health_service(request: Request) -> HealthService:
    return request.app.state.container.health


IdentityServiceDep = Annotated[IdentityService, Depends(identity_service)]
HealthServiceDep = Annotated[HealthService, Depends(health_service)]


def current_user(
    service: IdentityServiceDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> UserIdentity:
    if credentials is None:
        raise authentication_required()
    return service.current_user(credentials.credentials)


CurrentUser = Annotated[UserIdentity, Depends(current_user)]


def admin_user(user: CurrentUser, service: IdentityServiceDep) -> UserIdentity:
    return service.require_role(user, "ADMIN")


AdminUser = Annotated[UserIdentity, Depends(admin_user)]
