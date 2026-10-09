from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.identity import UserAccount, UserIdentity
from app.infrastructure.persistence.mapping import utc
from app.infrastructure.persistence.orm import User


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
