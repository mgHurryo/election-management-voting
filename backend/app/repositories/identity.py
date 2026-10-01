from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User
from app.models.identity import UserAccount, UserIdentity


def utc(value: datetime) -> datetime:
    # MySQL DATETIME is timezone-naive; the connection and all writers use UTC.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def account_from_row(row: User | None) -> UserAccount | None:
    if row is None:
        return None
    return UserAccount(
        identity=UserIdentity(
            id=row.id,
            username=row.username,
            display_name=row.display_name,
            role=row.role,
            status=row.status,
            created_at=utc(row.created_at),
            updated_at=utc(row.updated_at),
        ),
        password_hash=row.password_hash,
    )


class SqlAlchemyIdentityRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def by_username(self, username: str) -> UserAccount | None:
        return account_from_row(self._session.scalar(select(User).where(User.username == username)))

    def by_id(self, user_id: int) -> UserAccount | None:
        return account_from_row(self._session.get(User, user_id))
