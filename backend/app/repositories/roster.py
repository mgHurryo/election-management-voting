from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Election, ElectionVoter, User, VoteParticipation
from app.models.roster import ElectionSnapshot, VoterMembership
from app.repositories.identity import utc


def voter_already_exists() -> AppError:
    return AppError("VOTER_ALREADY_EXISTS", "Duplicate membership; do not create another row.", 409)


class SqlAlchemyRosterRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def election(self, election_id: int, *, for_update: bool = False) -> ElectionSnapshot | None:
        statement = select(Election).where(Election.id == election_id)
        if for_update:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        row = self._session.scalar(statement)
        if row is None:
            return None
        return ElectionSnapshot(id=row.id, status=row.status)

    def membership(self, election_id: int, user_id: int) -> VoterMembership | None:
        row = self._session.execute(
            select(ElectionVoter, User.display_name)
            .join(User, User.id == ElectionVoter.user_id)
            .where(ElectionVoter.election_id == election_id, ElectionVoter.user_id == user_id)
        ).first()
        if row is None:
            return None
        return self._membership(row[0], row[1])

    def memberships(
        self, election_id: int, offset: int, limit: int
    ) -> tuple[list[VoterMembership], int]:
        rows = self._session.execute(
            select(ElectionVoter, User.display_name)
            .join(User, User.id == ElectionVoter.user_id)
            .where(ElectionVoter.election_id == election_id)
            .order_by(ElectionVoter.user_id)
            .offset(offset)
            .limit(limit)
        ).all()
        total = self._session.scalar(
            select(func.count())
            .select_from(ElectionVoter)
            .where(ElectionVoter.election_id == election_id)
        )
        return [self._membership(row[0], row[1]) for row in rows], int(total or 0)

    def add(self, election_id: int, user_id: int, vote_quota: int) -> None:
        self._session.add(
            ElectionVoter(election_id=election_id, user_id=user_id, vote_quota=vote_quota)
        )
        try:
            self._session.flush()
        except IntegrityError as error:
            # Two concurrent adds racing on the composite key surface as 409.
            raise voter_already_exists() from error

    def remove(self, election_id: int, user_id: int) -> None:
        self._session.execute(
            delete(ElectionVoter).where(
                ElectionVoter.election_id == election_id, ElectionVoter.user_id == user_id
            )
        )

    def participation_count(self, election_id: int, user_id: int) -> int:
        count = self._session.scalar(
            select(func.count())
            .select_from(VoteParticipation)
            .where(
                VoteParticipation.election_id == election_id, VoteParticipation.user_id == user_id
            )
        )
        return int(count or 0)

    @staticmethod
    def _membership(row: ElectionVoter, display_name: str) -> VoterMembership:
        return VoterMembership(
            election_id=row.election_id,
            user_id=row.user_id,
            display_name=display_name,
            vote_quota=row.vote_quota,
            created_at=utc(row.created_at),
            updated_at=utc(row.updated_at),
        )
