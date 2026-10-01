from types import TracebackType
from typing import Self

from sqlalchemy.orm import Session, sessionmaker

from app.repositories.health import SqlAlchemyHealthRepository
from app.repositories.identity import SqlAlchemyIdentityRepository


class SqlAlchemyUnitOfWork:
    """A service owns each transaction; repositories never commit.

    A new instance is created per business operation, never shared across requests.
    Exiting without an explicit service commit rolls back, even on a normal return.
    """

    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def __enter__(self) -> Self:
        self._session = self._session_factory()
        self._session.begin()
        self.users = SqlAlchemyIdentityRepository(self._session)
        self.health = SqlAlchemyHealthRepository(self._session)
        return self

    def commit(self) -> None:
        self._session.commit()

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        try:
            self._session.rollback()
        finally:
            self._session.close()
