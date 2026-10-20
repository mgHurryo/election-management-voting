from collections.abc import Callable
from datetime import UTC, datetime

from app.core.errors import AppError
from app.models.elections import ElectionDetails
from app.models.identity import UserIdentity
from app.models.voting import (
    BallotView,
    CandidateTally,
    ParticipationStatus,
    ResultDetails,
    VoteAccepted,
)
from app.services.ports import UnitOfWork


def election_not_found() -> AppError:
    return AppError("ELECTION_NOT_FOUND", "Election absent, or detail outside visibility.", 404)


def utcnow() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


class VotingService:
    """M4 ballot, participation and voting workflows (API.md 4.16–4.18).

    Each public method owns one transaction; the API layer enforces the USER
    role, while eligibility, state and time window are rechecked here.
    """

    def __init__(
        self,
        uow_factory: Callable[[], UnitOfWork],
        clock: Callable[[], datetime] = utcnow,
    ) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    def get_ballot(self, election_id: int, user: UserIdentity) -> BallotView:
        """Serve the full ballot only to an eligible voter of an open election."""
        with self._uow_factory() as uow:
            election = uow.voting.election(election_id)
            if election is None:
                raise election_not_found()
            participation = self._participation(uow, election_id, user.id)
            if not participation.eligible:
                raise AppError("NOT_ELIGIBLE", "User is not on this election's voter roll.", 403)
            self._require_voting_window(election)
            return BallotView(
                election=election,
                candidates=uow.voting.all_candidates(election_id),
                participation=participation,
            )

    def get_participation(self, election_id: int, user: UserIdentity) -> ParticipationStatus:
        """Report the caller's own eligibility for any existing election state.

        Explicit visibility exception (API.md 4.17): a non-member of an existing
        election learns only their own false status, never the roster.
        """
        with self._uow_factory() as uow:
            if uow.voting.election(election_id) is None:
                raise election_not_found()
            return self._participation(uow, election_id, user.id)

    def cast_vote(self, election_id: int, user: UserIdentity, candidate_id: int) -> VoteAccepted:
        """Record one anonymous single-choice ballot inside the ADR-007 transaction.

        Lock order is elections -> election_voters. The shared election lock makes
        a concurrent close wait; eligibility, state, time window, candidate and
        quota are all (re)checked under it, so a committed ballot is final.
        """
        with self._uow_factory() as uow:
            election = uow.voting.election(election_id, for_share=True)
            if election is None:
                raise election_not_found()
            quota = uow.voting.vote_quota(election_id, user.id)
            if quota is None:
                raise AppError("NOT_ELIGIBLE", "User is not on this election's voter roll.", 403)
            self._require_voting_window(election)
            if uow.elections.candidate(election_id, candidate_id) is None:
                raise AppError(
                    "INVALID_CANDIDATE",
                    "Candidate does not exist in this election.",
                    400,
                )
            locked_quota = uow.voting.locked_vote_quota(election_id, user.id)
            if locked_quota is None:  # pragma: no cover - roster rows outlive OPEN
                raise AppError("NOT_ELIGIBLE", "User is not on this election's voter roll.", 403)
            used_votes, last_sequence = uow.voting.participation_usage(election_id, user.id)
            if used_votes >= locked_quota:
                raise AppError("VOTE_QUOTA_EXHAUSTED", "No remaining vote quota.", 409)
            uow.voting.record_vote(election_id, user.id, last_sequence + 1, candidate_id)
            uow.commit()
        return VoteAccepted(election_id=election_id, accepted=True)

    def get_results(self, election_id: int, user: UserIdentity) -> ResultDetails:
        """Recompute the tally for a closed election; USER reads require publish.

        The USER check is deliberately uniform (API.md 4.19): an unpublished
        result never reveals whether the election is closed or still running.
        """
        with self._uow_factory() as uow:
            election = uow.voting.election(election_id)
            if election is None:
                raise election_not_found()
            if user.role != "ADMIN":
                if election.results_published_at is None:
                    raise AppError("RESULTS_NOT_PUBLISHED", "Results are not published yet.", 409)
            elif election.status != "CLOSED":
                raise AppError("ELECTION_NOT_CLOSED", "Results require CLOSED status.", 409)
            return self._result(election, uow.voting.tally(election_id))

    def publish_results(self, election_id: int) -> ResultDetails:
        """Publish the recomputed result with the elections row held exclusively.

        Republishing returns the original result with the original timestamp; a
        tie or an all-zero tally keeps the election unpublished (draft D-06).
        """
        with self._uow_factory() as uow:
            election = uow.voting.election(election_id, for_update=True)
            if election is None:
                raise election_not_found()
            if election.status != "CLOSED":
                raise AppError("ELECTION_NOT_CLOSED", "Results require CLOSED status.", 409)
            tally = uow.voting.tally(election_id)
            if election.results_published_at is not None:
                return self._result(election, tally)
            if self._winner(tally) is None:
                raise AppError(
                    "RESULT_NOT_DECIDED",
                    "No unique positive-vote winner; publish rejected.",
                    409,
                )
            uow.voting.mark_published(election_id, self._clock())
            uow.commit()
            return self._result(uow.voting.election(election_id), tally)

    @staticmethod
    def _winner(tally: list[CandidateTally]) -> int | None:
        """Only a unique strictly positive leader wins; ties and zeros stay open."""
        if not tally or tally[0].vote_count == 0:
            return None
        if len(tally) > 1 and tally[1].vote_count == tally[0].vote_count:
            return None
        return tally[0].candidate_id

    @staticmethod
    def _result(election, tally: list[CandidateTally]) -> ResultDetails:
        return ResultDetails(
            election_id=election.id,
            position_title=election.position_title,
            results_published_at=election.results_published_at,
            total_votes=sum(row.vote_count for row in tally),
            candidates=tally,
            winner_candidate_id=VotingService._winner(tally),
        )

    def _require_voting_window(self, election: ElectionDetails) -> None:
        if election.status != "OPEN":
            raise AppError("ELECTION_NOT_OPEN", "Ballot access requires OPEN status.", 409)
        now = self._clock()
        if now < election.starts_at:
            raise AppError("VOTING_NOT_STARTED", "Voting time window has not started.", 409)
        if now > election.ends_at:
            raise AppError("VOTING_ENDED", "Voting time window has ended.", 409)

    @staticmethod
    def _participation(uow: UnitOfWork, election_id: int, user_id: int) -> ParticipationStatus:
        """Own status only: quota from the roster row, usage from participation."""
        quota = uow.voting.vote_quota(election_id, user_id)
        if quota is None:
            return ParticipationStatus(
                election_id=election_id,
                eligible=False,
                vote_quota=0,
                used_votes=0,
                remaining_votes=0,
            )
        used_votes, _ = uow.voting.participation_usage(election_id, user_id)
        return ParticipationStatus(
            election_id=election_id,
            eligible=True,
            vote_quota=quota,
            used_votes=used_votes,
            remaining_votes=max(quota - used_votes, 0),
        )
