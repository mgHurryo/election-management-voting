from collections.abc import Callable

from app.core.errors import AppError
from app.models.roster import VoterMembership
from app.services.ports import UnitOfWork


def election_not_found() -> AppError:
    return AppError("ELECTION_NOT_FOUND", "Election absent, or detail outside visibility.", 404)


def election_not_editable() -> AppError:
    return AppError("ELECTION_NOT_EDITABLE", "Mutation requires DRAFT.", 409)


class RosterService:
    """M2 voter roll workflows (API.md 4.13–4.15).

    Each public method owns one transaction; role checks happen at the API
    layer, election state and account validity are rechecked here.
    """

    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory

    def list_voters(
        self, election_id: int, page: int, page_size: int
    ) -> tuple[list[VoterMembership], int]:
        with self._uow_factory() as uow:
            if uow.roster.election(election_id) is None:
                raise election_not_found()
            return uow.roster.memberships(election_id, (page - 1) * page_size, page_size)

    def add_voter(self, election_id: int, user_id: int, vote_quota: int) -> VoterMembership:
        with self._uow_factory() as uow:
            # Hold the election lock through commit so opening cannot race eligibility changes.
            election = uow.roster.election(election_id, for_update=True)
            if election is None:
                raise election_not_found()
            if election.status != "DRAFT":
                raise election_not_editable()
            account = uow.users.by_id(user_id)
            if account is None:
                raise AppError(
                    "USER_NOT_FOUND", "ADMIN-specified roster account does not exist.", 404
                )
            if account.identity.status != "ACTIVE" or account.identity.role != "USER":
                raise AppError("INVALID_VOTER", "Existing account is not ACTIVE or not USER.", 422)
            if uow.roster.membership(election_id, user_id) is not None:
                raise AppError(
                    "VOTER_ALREADY_EXISTS", "Duplicate membership; do not create another row.", 409
                )
            uow.roster.add(election_id, user_id, vote_quota)
            membership = uow.roster.membership(election_id, user_id)
            if membership is None:  # pragma: no cover - defensive
                raise AppError("INTERNAL_ERROR", "An internal error occurred.", 500)
            uow.commit()
        return membership

    def remove_voter(self, election_id: int, user_id: int) -> None:
        with self._uow_factory() as uow:
            election = uow.roster.election(election_id, for_update=True)
            if election is None:
                raise election_not_found()
            if election.status != "DRAFT":
                raise election_not_editable()
            if uow.roster.membership(election_id, user_id) is None:
                raise AppError("VOTER_NOT_FOUND", "Target membership does not exist.", 404)
            if uow.roster.participation_count(election_id, user_id) > 0:
                raise AppError(
                    "RESOURCE_CONFLICT",
                    "Existing reference/immutable record prevents safe mutation.",
                    409,
                )
            uow.roster.remove(election_id, user_id)
            uow.commit()
