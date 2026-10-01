from types import TracebackType
from typing import Protocol, Self

from app.models.identity import UserAccount


class IdentityRepository(Protocol):
    def by_username(self, username: str) -> UserAccount | None: ...
    def by_id(self, user_id: int) -> UserAccount | None: ...


class HealthRepository(Protocol):
    def ping(self) -> None: ...


class UnitOfWork(Protocol):
    users: IdentityRepository
    health: HealthRepository

    def __enter__(self) -> Self: ...
    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None: ...
    def commit(self) -> None: ...
