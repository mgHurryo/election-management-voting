from datetime import UTC, datetime

from sqlalchemy import delete, exists, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    BallotChoice,
    Election,
    ElectionCandidate,
    ElectionVoter,
    User,
)
from app.models.elections import CandidateDetails, ElectionDetails
from app.models.identity import UserIdentity
from app.repositories.identity import utc


def _database_time(value: datetime) -> datetime:
    return value.astimezone(UTC).replace(tzinfo=None)


class SqlAlchemyElectionsRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self,
        *,
        title: str,
        position_title: str,
        description: str | None,
        created_by: int,
        starts_at: datetime,
        ends_at: datetime,
        voter_ids: list[int],
    ) -> ElectionDetails:
        row = Election(
            title=title,
            position_title=position_title,
            description=description,
            created_by=created_by,
            privacy_mode="FORCED_ANONYMOUS",
            starts_at=_database_time(starts_at),
            ends_at=_database_time(ends_at),
        )
        self._session.add(row)
        self._session.flush()
        self._session.add_all(
            [
                ElectionVoter(election_id=row.id, user_id=user_id, vote_quota=1)
                for user_id in voter_ids
            ]
        )
        self._session.flush()
        return self._election(row)

    def election(self, election_id: int, *, for_update: bool = False) -> ElectionDetails | None:
        statement = select(Election).where(Election.id == election_id)
        if for_update:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        row = self._session.scalar(statement)
        return self._election(row) if row is not None else None

    def elections(
        self,
        *,
        user: UserIdentity,
        status: str | None,
        offset: int,
        limit: int,
    ) -> tuple[list[ElectionDetails], int]:
        statement = select(Election)
        count_statement = select(func.count()).select_from(Election)
        if user.role != "ADMIN":
            voter_membership = exists(
                select(1).where(
                    ElectionVoter.election_id == Election.id,
                    ElectionVoter.user_id == user.id,
                )
            )
            visible = or_(voter_membership, Election.results_published_at.is_not(None))
            statement = statement.where(visible)
            count_statement = count_statement.where(visible)
        if status is not None:
            statement = statement.where(Election.status == status)
            count_statement = count_statement.where(Election.status == status)
        rows = self._session.scalars(
            statement.order_by(Election.id.desc()).offset(offset).limit(limit)
        ).all()
        total = self._session.scalar(count_statement)
        return [self._election(row) for row in rows], int(total or 0)

    def update_election(self, election_id: int, changes: dict[str, object]) -> ElectionDetails:
        row = self._session.get(Election, election_id)
        for field_name, value in changes.items():
            if field_name in {"starts_at", "ends_at"} and isinstance(value, datetime):
                value = _database_time(value)
            setattr(row, field_name, value)
        row.updated_at = datetime.now(UTC).replace(tzinfo=None, microsecond=0)
        self._session.flush()
        return self._election(row)

    def update_status(self, election_id: int, status: str) -> ElectionDetails:
        row = self._session.get(Election, election_id)
        row.status = status
        row.updated_at = datetime.now(UTC).replace(tzinfo=None, microsecond=0)
        self._session.flush()
        return self._election(row)

    def drafts_window_started(self, now: datetime) -> list[int]:
        """DRAFT elections whose window is currently active (started, not ended)."""
        return list(
            self._session.scalars(
                select(Election.id).where(
                    Election.status == "DRAFT",
                    Election.starts_at <= _database_time(now),
                    Election.ends_at >= _database_time(now),
                )
            ).all()
        )

    def open_window_ended(self, now: datetime) -> list[int]:
        """OPEN elections whose window has already passed."""
        return list(
            self._session.scalars(
                select(Election.id).where(
                    Election.status == "OPEN",
                    Election.ends_at < _database_time(now),
                )
            ).all()
        )

    def has_active_voter(self, election_id: int) -> bool:
        return bool(
            self._session.scalar(
                select(
                    exists(
                        select(1)
                        .select_from(ElectionVoter)
                        .join(User, User.id == ElectionVoter.user_id)
                        .where(
                            ElectionVoter.election_id == election_id,
                            ElectionVoter.vote_quota == 1,
                            User.role == "USER",
                            User.status == "ACTIVE",
                        )
                    )
                )
            )
        )

    def has_valid_candidates(self, election_id: int) -> bool:
        invalid = exists(
            select(1).where(
                ElectionCandidate.election_id == election_id,
                or_(
                    func.trim(ElectionCandidate.name) == "",
                    ElectionCandidate.description.is_(None),
                    func.trim(ElectionCandidate.description) == "",
                    func.length(ElectionCandidate.description) > 10000,
                    ElectionCandidate.display_order < 0,
                    ElectionCandidate.photo_url.is_not(None)
                    & ~ElectionCandidate.photo_url.ilike("https://%"),
                ),
            )
        )
        count = self._session.scalar(
            select(func.count())
            .select_from(ElectionCandidate)
            .where(ElectionCandidate.election_id == election_id)
        )
        return bool(count) and not bool(self._session.scalar(select(invalid)))

    def candidates(
        self, election_id: int, offset: int, limit: int
    ) -> tuple[list[CandidateDetails], int]:
        statement = (
            select(ElectionCandidate, Election.position_title)
            .join(Election, Election.id == ElectionCandidate.election_id)
            .where(ElectionCandidate.election_id == election_id)
        )
        rows = self._session.execute(
            statement.order_by(ElectionCandidate.display_order, ElectionCandidate.id)
            .offset(offset)
            .limit(limit)
        ).all()
        total = self._session.scalar(
            select(func.count())
            .select_from(ElectionCandidate)
            .where(ElectionCandidate.election_id == election_id)
        )
        return [self._candidate(row[0], row[1]) for row in rows], int(total or 0)

    def candidate(
        self, election_id: int, candidate_id: int, *, for_update: bool = False
    ) -> CandidateDetails | None:
        statement = (
            select(ElectionCandidate, Election.position_title)
            .join(Election, Election.id == ElectionCandidate.election_id)
            .where(
                ElectionCandidate.election_id == election_id,
                ElectionCandidate.id == candidate_id,
            )
        )
        if for_update:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        row = self._session.execute(statement).first()
        return self._candidate(row[0], row[1]) if row is not None else None

    def add_candidate(
        self,
        election_id: int,
        *,
        name: str,
        description: str,
        photo_url: str | None,
        display_order: int,
    ) -> CandidateDetails:
        row = ElectionCandidate(
            election_id=election_id,
            name=name,
            description=description,
            photo_url=photo_url,
            display_order=display_order,
        )
        self._session.add(row)
        self._session.flush()
        return self.candidate(election_id, row.id)

    def update_candidate(
        self, election_id: int, candidate_id: int, changes: dict[str, object]
    ) -> CandidateDetails:
        row = self._session.scalar(
            select(ElectionCandidate).where(
                ElectionCandidate.election_id == election_id,
                ElectionCandidate.id == candidate_id,
            )
        )
        for field_name, value in changes.items():
            setattr(row, field_name, value)
        row.updated_at = datetime.now(UTC).replace(tzinfo=None, microsecond=0)
        self._session.flush()
        return self.candidate(election_id, candidate_id)

    def candidate_is_referenced(self, election_id: int, candidate_id: int) -> bool:
        return bool(
            self._session.scalar(
                select(
                    exists(
                        select(1).where(
                            BallotChoice.election_id == election_id,
                            BallotChoice.candidate_id == candidate_id,
                        )
                    )
                )
            )
        )

    def delete_candidate(self, election_id: int, candidate_id: int) -> None:
        self._session.execute(
            delete(ElectionCandidate).where(
                ElectionCandidate.election_id == election_id,
                ElectionCandidate.id == candidate_id,
            )
        )

    def has_voter(self, election_id: int, user_id: int) -> bool:
        return bool(
            self._session.scalar(
                select(
                    exists(
                        select(1).where(
                            ElectionVoter.election_id == election_id,
                            ElectionVoter.user_id == user_id,
                        )
                    )
                )
            )
        )

    @staticmethod
    def _election(row: Election) -> ElectionDetails:
        return ElectionDetails(
            id=row.id,
            title=row.title,
            position_title=row.position_title,
            description=row.description,
            created_by=row.created_by,
            status=row.status,
            privacy_mode=row.privacy_mode,
            starts_at=utc(row.starts_at),
            ends_at=utc(row.ends_at),
            results_published_at=utc(row.results_published_at)
            if row.results_published_at is not None
            else None,
            created_at=utc(row.created_at),
            updated_at=utc(row.updated_at),
        )

    @staticmethod
    def _candidate(row: ElectionCandidate, position_title: str) -> CandidateDetails:
        return CandidateDetails(
            id=row.id,
            election_id=row.election_id,
            name=row.name,
            position_title=position_title,
            description=row.description,
            photo_url=row.photo_url,
            display_order=row.display_order,
            created_at=utc(row.created_at),
            updated_at=utc(row.updated_at),
        )
