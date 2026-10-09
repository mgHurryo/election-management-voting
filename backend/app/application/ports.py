from types import TracebackType
from typing import Protocol, Self

from app.domain.identity import UserAccount
from app.domain.roster import ElectionSnapshot, VoterMembership


class DuplicateMembership(Exception):
    """The membership key already exists; no HTTP or database details escape."""


class MembershipReferenced(Exception):
    """An immutable record prevents removing this membership."""


class TokenService(Protocol):
    expires_in: int

    def issue(self, user_id: int) -> str: ...
    def subject(self, token: str) -> int: ...


class IdentityRepository(Protocol):
    def by_username(self, username: str) -> UserAccount | None: ...
    def by_id(self, user_id: int) -> UserAccount | None: ...


class HealthRepository(Protocol):
    def ping(self) -> None: ...


class RosterRepository(Protocol):
    def election(
        self, election_id: int, *, for_update: bool = False
    ) -> ElectionSnapshot | None: ...
    def membership(self, election_id: int, user_id: int) -> VoterMembership | None: ...
    def memberships(
        self, election_id: int, offset: int, limit: int
    ) -> tuple[list[VoterMembership], int]: ...
    def add(self, election_id: int, user_id: int, vote_quota: int) -> None: ...
    def remove(self, election_id: int, user_id: int) -> None: ...
    def participation_count(self, election_id: int, user_id: int) -> int: ...


class UnitOfWork(Protocol):
    users: IdentityRepository
    health: HealthRepository
    roster: RosterRepository

    def __enter__(self) -> Self: ...
    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None: ...
    def commit(self) -> None: ...
