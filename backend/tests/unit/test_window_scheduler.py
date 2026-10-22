"""Unit tests for the wall-clock window transition runner."""

from datetime import UTC, datetime

from app.core.errors import AppError
from app.services.window import run_window_transitions

NOW = datetime(2026, 10, 22, 12, 0, 0, tzinfo=UTC)


class FakeElectionsRepository:
    def __init__(self, due_open: list[int], due_close: list[int]) -> None:
        self._due_open = due_open
        self._due_close = due_close
        self.asked_now: list[datetime] = []

    def drafts_window_started(self, now: datetime) -> list[int]:
        self.asked_now.append(now)
        return list(self._due_open)

    def open_window_ended(self, now: datetime) -> list[int]:
        return list(self._due_close)


class FakeUnitOfWork:
    def __init__(self, elections: FakeElectionsRepository) -> None:
        self.elections = elections
        self.exits = 0

    def __enter__(self) -> "FakeUnitOfWork":
        return self

    def __exit__(self, *args: object) -> bool:
        self.exits += 1
        return False

    def commit(self) -> None: ...
    def rollback(self) -> None: ...


class RecordingElectionsService:
    def __init__(self, failures: dict[tuple[str, int], AppError] | None = None) -> None:
        self.opened: list[int] = []
        self.closed: list[int] = []
        self._failures = failures or {}

    def open_election(self, election_id: int) -> None:
        failure = self._failures.get(("open", election_id))
        if failure is not None:
            raise failure
        self.opened.append(election_id)

    def close_election(self, election_id: int) -> None:
        failure = self._failures.get(("close", election_id))
        if failure is not None:
            raise failure
        self.closed.append(election_id)


def test_applies_due_transitions_and_reports_counts():
    repo = FakeElectionsRepository(due_open=[7], due_close=[4, 5])
    uow = FakeUnitOfWork(repo)
    elections = RecordingElectionsService()

    opened, closed = run_window_transitions(lambda: uow, elections, lambda: NOW)

    assert (opened, closed) == (1, 2)
    assert elections.opened == [7]
    assert elections.closed == [4, 5]
    assert repo.asked_now == [NOW]
    assert uow.exits == 1


def test_skips_close_race_without_touching_the_rest():
    elections = RecordingElectionsService(
        {("close", 4): AppError("INVALID_STATE_TRANSITION", "not OPEN", 409)}
    )
    uow = FakeUnitOfWork(FakeElectionsRepository(due_open=[], due_close=[4, 5]))

    opened, closed = run_window_transitions(lambda: uow, elections, lambda: NOW)

    assert (opened, closed) == (0, 1)
    assert elections.closed == [5]


def test_leaves_unready_drafts_for_a_later_tick():
    elections = RecordingElectionsService(
        {("open", 7): AppError("ELECTION_NOT_READY", "no valid candidate", 409)}
    )
    uow = FakeUnitOfWork(FakeElectionsRepository(due_open=[7], due_close=[]))

    opened, closed = run_window_transitions(lambda: uow, elections, lambda: NOW)

    assert (opened, closed) == (0, 0)
    assert elections.opened == []


def test_stops_between_transitions_once_shutdown_is_requested():
    elections = RecordingElectionsService()
    uow = FakeUnitOfWork(FakeElectionsRepository(due_open=[7, 8], due_close=[4]))
    polls = []

    def stopping() -> bool:
        polls.append(1)
        return len(polls) > 1  # allow the first transition, halt before the next

    opened, closed = run_window_transitions(lambda: uow, elections, lambda: NOW, stopping)

    assert (opened, closed) == (0, 1)
    assert elections.closed == [4]
    assert elections.opened == []
