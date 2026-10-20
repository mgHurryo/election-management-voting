from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import authentication_required
from app.models.identity import UserIdentity
from app.services.elections import ElectionsService
from app.services.health import HealthService
from app.services.identity import IdentityService
from app.services.roster import RosterService
from app.services.voting import VotingService

bearer = HTTPBearer(auto_error=False)


def identity_service(request: Request) -> IdentityService:
    return request.app.state.container.identity


def health_service(request: Request) -> HealthService:
    return request.app.state.container.health


def roster_service(request: Request) -> RosterService:
    return request.app.state.container.roster


def elections_service(request: Request) -> ElectionsService:
    return request.app.state.container.elections


def voting_service(request: Request) -> VotingService:
    return request.app.state.container.voting


IdentityServiceDep = Annotated[IdentityService, Depends(identity_service)]
HealthServiceDep = Annotated[HealthService, Depends(health_service)]
RosterServiceDep = Annotated[RosterService, Depends(roster_service)]
ElectionsServiceDep = Annotated[ElectionsService, Depends(elections_service)]
VotingServiceDep = Annotated[VotingService, Depends(voting_service)]


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


def voter_user(user: CurrentUser, service: IdentityServiceDep) -> UserIdentity:
    # ADMIN has no v1 voting role; ballot and vote operations are USER-only.
    return service.require_role(user, "USER")


VoterUser = Annotated[UserIdentity, Depends(voter_user)]
