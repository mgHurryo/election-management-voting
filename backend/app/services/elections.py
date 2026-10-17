from collections.abc import Callable
from datetime import UTC, datetime

from app.core.errors import AppError
from app.models.elections import CandidateDetails, ElectionDetails
from app.models.identity import UserIdentity
from app.schemas.elections import ElectionCreateRequest
from app.services.ports import UnitOfWork


def _not_found() -> AppError:
    return AppError("ELECTION_NOT_FOUND", "Election not found or not visible.", 404)


def _not_editable() -> AppError:
    return AppError("ELECTION_NOT_EDITABLE", "Election mutations require DRAFT status.", 409)


def utcnow() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


class ElectionsService:
    """M3 election and candidate workflows; each public operation owns its transaction."""

    def __init__(
        self,
        unit_of_work_factory: Callable[[], UnitOfWork],
        clock: Callable[[], datetime] = utcnow,
    ) -> None:
        self._unit_of_work_factory = unit_of_work_factory
        self._clock = clock

    def list_elections(
        self, user: UserIdentity, page: int, page_size: int, status: str | None
    ) -> tuple[list[ElectionDetails], int]:
        with self._unit_of_work_factory() as uow:
            return uow.elections.elections(
                user=user,
                status=status,
                offset=(page - 1) * page_size,
                limit=page_size,
            )

    def get_election(self, election_id: int, user: UserIdentity) -> ElectionDetails:
        with self._unit_of_work_factory() as uow:
            election = uow.elections.election(election_id)
            if election is None:
                raise _not_found()
            if user.role != "ADMIN" and not (
                election.results_published_at is not None
                or uow.elections.has_voter(election_id, user.id)
            ):
                raise _not_found()
            return election

    def create_election(self, request: ElectionCreateRequest, created_by: int) -> ElectionDetails:
        """Validate roster accounts before one atomic election-and-roster commit."""
        if request.starts_at >= request.ends_at:
            raise AppError("INVALID_TIME_RANGE", "starts_at must precede ends_at.", 422)
        if request.privacy_mode != "FORCED_ANONYMOUS":
            raise AppError(
                "PRIVACY_MODE_VIOLATION",
                "Only FORCED_ANONYMOUS is available in v1.",
                400,
            )

        with self._unit_of_work_factory() as uow:
            for voter_id in request.voter_ids:
                account = uow.users.by_id(int(voter_id))
                if account is None:
                    raise AppError("USER_NOT_FOUND", "A roster account does not exist.", 404)
                if account.identity.role != "USER" or account.identity.status != "ACTIVE":
                    raise AppError(
                        "INVALID_VOTER", "Roster entries must be ACTIVE USER accounts.", 422
                    )
            election = uow.elections.create(
                title=request.title,
                position_title=request.position_title,
                description=request.description,
                created_by=created_by,
                starts_at=request.starts_at,
                ends_at=request.ends_at,
                voter_ids=[int(user_id) for user_id in request.voter_ids],
            )
            uow.commit()
            return election

    def update_election(self, election_id: int, changes: dict[str, object]) -> ElectionDetails:
        """Lock the election while checking merged fields to serialize against opening."""
        with self._unit_of_work_factory() as uow:
            election = uow.elections.election(election_id, for_update=True)
            if election is None:
                raise _not_found()
            self._require_draft(election)
            merged_starts = changes.get("starts_at", election.starts_at)
            merged_ends = changes.get("ends_at", election.ends_at)
            if merged_starts >= merged_ends:
                raise AppError("INVALID_TIME_RANGE", "starts_at must precede ends_at.", 422)
            if changes.get("privacy_mode", election.privacy_mode) != "FORCED_ANONYMOUS":
                raise AppError(
                    "PRIVACY_MODE_VIOLATION",
                    "Only FORCED_ANONYMOUS is available in v1.",
                    400,
                )
            updated = uow.elections.update_election(election_id, changes)
            uow.commit()
            return updated

    def open_election(self, election_id: int) -> ElectionDetails:
        """Atomically validate readiness and time bounds before DRAFT -> OPEN."""
        with self._unit_of_work_factory() as uow:
            election = uow.elections.election(election_id, for_update=True)
            if election is None:
                raise _not_found()
            if election.status != "DRAFT":
                raise AppError("INVALID_STATE_TRANSITION", "Election is not a DRAFT.", 409)

            now = self._clock()
            if now < election.starts_at:
                raise AppError("VOTING_NOT_STARTED", "Voting time window has not started.", 409)
            if now > election.ends_at:
                raise AppError("VOTING_ENDED", "Voting time window has ended.", 409)
            if election.privacy_mode != "FORCED_ANONYMOUS":
                raise AppError(
                    "ELECTION_NOT_READY", "Election privacy configuration is invalid.", 409
                )
            if not uow.elections.has_valid_candidates(election_id):
                raise AppError("ELECTION_NOT_READY", "Election has no valid candidate.", 409)
            if not uow.elections.has_active_voter(election_id):
                raise AppError("ELECTION_NOT_READY", "Election has no eligible active voter.", 409)

            # The row lock serializes opening against roster and candidate draft edits.
            opened = uow.elections.update_status(election_id, "OPEN")
            uow.commit()
            return opened

    def close_election(self, election_id: int) -> ElectionDetails:
        """Serialize closure against concurrent election state changes."""
        with self._unit_of_work_factory() as uow:
            election = uow.elections.election(election_id, for_update=True)
            if election is None:
                raise _not_found()
            if election.status != "OPEN":
                raise AppError(
                    "INVALID_STATE_TRANSITION", "Only OPEN elections can be closed.", 409
                )
            closed = uow.elections.update_status(election_id, "CLOSED")
            uow.commit()
            return closed

    def list_candidates(
        self, election_id: int, user: UserIdentity, page: int, page_size: int
    ) -> tuple[list[CandidateDetails], int]:
        """Expose candidates to admins or eligible voters during the active window."""
        with self._unit_of_work_factory() as uow:
            election = uow.elections.election(election_id)
            if election is None:
                raise _not_found()
            if user.role != "ADMIN":
                if not uow.elections.has_voter(election_id, user.id):
                    raise AppError(
                        "NOT_ELIGIBLE", "User is not on this election's voter roll.", 403
                    )
                if election.status != "OPEN":
                    raise AppError(
                        "ELECTION_NOT_OPEN",
                        "Candidates are visible to voters only while open.",
                        409,
                    )
                now = self._clock()
                if now < election.starts_at:
                    raise AppError("VOTING_NOT_STARTED", "Voting time window has not started.", 409)
                if now > election.ends_at:
                    raise AppError("VOTING_ENDED", "Voting time window has ended.", 409)
            return uow.elections.candidates(
                election_id,
                (page - 1) * page_size,
                page_size,
            )

    def add_candidate(
        self,
        election_id: int,
        *,
        name: str,
        description: str,
        photo_url: str | None,
        display_order: int,
    ) -> CandidateDetails:
        """Serialize DRAFT candidate creation with an election-opening transition."""
        with self._unit_of_work_factory() as uow:
            election = uow.elections.election(election_id, for_update=True)
            if election is None:
                raise _not_found()
            self._require_draft(election)
            candidate = uow.elections.add_candidate(
                election_id,
                name=name,
                description=description,
                photo_url=photo_url,
                display_order=display_order,
            )
            uow.commit()
            return candidate

    def update_candidate(
        self, election_id: int, candidate_id: int, changes: dict[str, object]
    ) -> CandidateDetails:
        """Update only a candidate owned by the locked DRAFT election."""
        with self._unit_of_work_factory() as uow:
            election = uow.elections.election(election_id, for_update=True)
            if election is None:
                raise _not_found()
            self._require_draft(election)
            if uow.elections.candidate(election_id, candidate_id) is None:
                raise AppError("CANDIDATE_NOT_FOUND", "Candidate not found in this election.", 404)
            candidate = uow.elections.update_candidate(election_id, candidate_id, changes)
            uow.commit()
            return candidate

    def delete_candidate(self, election_id: int, candidate_id: int) -> None:
        """Keep the election locked while checking candidate references and deleting."""
        with self._unit_of_work_factory() as uow:
            election = uow.elections.election(election_id, for_update=True)
            if election is None:
                raise _not_found()
            self._require_draft(election)
            if uow.elections.candidate(election_id, candidate_id) is None:
                raise AppError("CANDIDATE_NOT_FOUND", "Candidate not found in this election.", 404)
            if uow.elections.candidate_is_referenced(election_id, candidate_id):
                raise AppError(
                    "RESOURCE_CONFLICT",
                    "Candidate is referenced by a ballot and cannot be deleted.",
                    409,
                )
            uow.elections.delete_candidate(election_id, candidate_id)
            uow.commit()

    @staticmethod
    def _require_draft(election: ElectionDetails) -> None:
        if election.status != "DRAFT":
            raise _not_editable()
