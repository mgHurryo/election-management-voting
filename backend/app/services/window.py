"""Wall-clock driven election status transitions.

Without this runner, election status changes only through explicit committee
actions, so an OPEN election could stay open long after ``ends_at`` — the ballot
endpoint then rejects every request with VOTING_ENDED while the election still
claims to be open — and a ready DRAFT whose window has started would never begin
voting by itself. The runner reuses the manual open/close operations, keeping
their readiness checks, window bounds and row locks; the lifespan scheduler in
``app.main`` only decides when to call it.
"""

import logging
from collections.abc import Callable
from datetime import datetime

from app.core.errors import AppError
from app.services.elections import ElectionsService, utcnow
from app.services.ports import UnitOfWork

logger = logging.getLogger("app")


def run_window_transitions(
    uow_factory: Callable[[], UnitOfWork],
    elections: ElectionsService,
    now: Callable[[], datetime] = utcnow,
) -> tuple[int, int]:
    """Apply due window transitions once and return (opened, closed) counts."""
    with uow_factory() as uow:
        current = now()
        due_close = uow.elections.open_window_ended(current)
        due_open = uow.elections.drafts_window_started(current)
    closed = 0
    for election_id in due_close:
        try:
            elections.close_election(election_id)
            closed += 1
        except AppError as reason:
            # Lost a race against a concurrent transition; the next tick re-reads.
            logger.debug("auto-close skipped election %s: %s", election_id, reason.code)
    opened = 0
    for election_id in due_open:
        try:
            elections.open_election(election_id)
            opened += 1
        except AppError as reason:
            # Not ready (candidates/roster) or the window just ended: the election
            # stays DRAFT and the same tick re-evaluates it after every change.
            logger.debug("auto-open skipped election %s: %s", election_id, reason.code)
    if opened or closed:
        logger.info("window transitions applied: opened=%d closed=%d", opened, closed)
    return opened, closed
