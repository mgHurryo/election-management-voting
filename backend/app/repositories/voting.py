from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Ballot,
    BallotChoice,
    Election,
    ElectionCandidate,
    ElectionVoter,
    VoteParticipation,
)
from app.models.elections import CandidateDetails, ElectionDetails
from app.repositories.elections import SqlAlchemyElectionsRepository


class SqlAlchemyVotingRepository:
    """Ballot, participation and vote persistence; the owning service commits."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def election(
        self, election_id: int, *, for_update: bool = False, for_share: bool = False
    ) -> ElectionDetails | None:
        statement = select(Election).where(Election.id == election_id)
        if for_update:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        elif for_share:
            statement = statement.with_for_update(share=True).execution_options(
                populate_existing=True
            )
        row = self._session.scalar(statement)
        return SqlAlchemyElectionsRepository._election(row) if row is not None else None

    def vote_quota(self, election_id: int, user_id: int) -> int | None:
        """The caller's roster quota, or None when not on the roll."""
        return self._session.scalar(
            select(ElectionVoter.vote_quota).where(
                ElectionVoter.election_id == election_id,
                ElectionVoter.user_id == user_id,
            )
        )

    def locked_vote_quota(self, election_id: int, user_id: int) -> int | None:
        """Take the roster row's exclusive lock (ADR-007) and return its quota."""
        return self._session.scalar(
            select(ElectionVoter.vote_quota)
            .where(
                ElectionVoter.election_id == election_id,
                ElectionVoter.user_id == user_id,
            )
            .with_for_update()
        )

    def participation_usage(self, election_id: int, user_id: int) -> tuple[int, int]:
        """Return (used_votes, last_vote_sequence) for one roster member."""
        row = self._session.execute(
            select(func.count(), func.coalesce(func.max(VoteParticipation.vote_sequence), 0))
            .select_from(VoteParticipation)
            .where(
                VoteParticipation.election_id == election_id,
                VoteParticipation.user_id == user_id,
            )
        ).one()
        return int(row[0]), int(row[1])

    def all_candidates(self, election_id: int) -> list[CandidateDetails]:
        rows = self._session.execute(
            select(ElectionCandidate, Election.position_title)
            .join(Election, Election.id == ElectionCandidate.election_id)
            .where(ElectionCandidate.election_id == election_id)
            .order_by(ElectionCandidate.display_order, ElectionCandidate.id)
        ).all()
        return [SqlAlchemyElectionsRepository._candidate(row[0], row[1]) for row in rows]

    def record_vote(
        self, election_id: int, user_id: int, vote_sequence: int, candidate_id: int
    ) -> None:
        """Write participation, anonymous ballot and choice as one all-or-nothing unit.

        v1 forces ballots.voter_id to NULL (FR-11): the participation row is the
        only identity-linked record and never references the ballot.
        """
        self._session.add(
            VoteParticipation(
                election_id=election_id,
                user_id=user_id,
                vote_sequence=vote_sequence,
            )
        )
        ballot = Ballot(election_id=election_id, voter_id=None, is_anonymous=True)
        self._session.add(ballot)
        self._session.flush()
        self._session.add(
            BallotChoice(
                election_id=election_id,
                ballot_id=ballot.id,
                candidate_id=candidate_id,
            )
        )
        self._session.flush()
