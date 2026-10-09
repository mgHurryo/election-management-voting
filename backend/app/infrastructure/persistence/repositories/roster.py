from sqlite3 import SQLITE_CONSTRAINT_PRIMARYKEY, SQLITE_CONSTRAINT_UNIQUE

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.application.ports import DuplicateMembership, MembershipReferenced
from app.domain.roster import ElectionSnapshot, VoterMembership
from app.infrastructure.persistence.mapping import utc
from app.infrastructure.persistence.orm import Election, ElectionVoter, User, VoteParticipation

MYSQL_DUPLICATE_KEY = 1062
MYSQL_ROW_IS_REFERENCED = 1451


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
            # Other integrity failures (foreign keys, checks) are not duplicate memberships.
            mysql_code = error.orig.args[0] if error.orig.args else None
            sqlite_code = getattr(error.orig, "sqlite_errorcode", None)
            if mysql_code == MYSQL_DUPLICATE_KEY or sqlite_code in (
                SQLITE_CONSTRAINT_PRIMARYKEY,
                SQLITE_CONSTRAINT_UNIQUE,
            ):
                raise DuplicateMembership() from error
            raise

    def remove(self, election_id: int, user_id: int) -> None:
        try:
            self._session.execute(
                delete(ElectionVoter).where(
                    ElectionVoter.election_id == election_id, ElectionVoter.user_id == user_id
                )
            )
        except IntegrityError as error:
            if error.orig.args and error.orig.args[0] == MYSQL_ROW_IS_REFERENCED:
                raise MembershipReferenced() from error
            raise

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
