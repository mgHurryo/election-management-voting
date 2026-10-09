from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest
from pymysql.err import IntegrityError as MySQLIntegrityError
from sqlalchemy.exc import IntegrityError

from app.application.errors import AppError
from app.application.ports import DuplicateMembership, MembershipReferenced
from app.application.services.roster import RosterService
from app.domain.identity import UserAccount, UserIdentity
from app.domain.roster import ElectionSnapshot
from app.infrastructure.persistence.repositories.roster import SqlAlchemyRosterRepository


@pytest.mark.parametrize(
    "mysql_code,expected",
    [(1062, DuplicateMembership), (1452, IntegrityError), (3819, IntegrityError)],
)
def test_repository_distinguishes_duplicate_key_from_other_integrity_failures(mysql_code, expected):
    session = MagicMock()
    error = IntegrityError(
        "insert", {}, MySQLIntegrityError(mysql_code, "private database details")
    )
    session.flush.side_effect = error
    with pytest.raises(expected) as caught:
        SqlAlchemyRosterRepository(session).add(10, 42, 1)
    if expected is DuplicateMembership:
        assert caught.value.__cause__ is error
        assert "private" not in str(caught.value)
    else:
        assert caught.value is error


@pytest.mark.parametrize(
    "mysql_code,expected", [(1451, MembershipReferenced), (9999, IntegrityError)]
)
def test_repository_reports_referenced_membership_without_http(mysql_code, expected):
    session = MagicMock()
    session.execute.side_effect = IntegrityError(
        "delete", {}, MySQLIntegrityError(mysql_code, "private database details")
    )
    with pytest.raises(expected):
        SqlAlchemyRosterRepository(session).remove(10, 42)


@pytest.mark.parametrize(
    "operation,port_error,code",
    [
        ("add", DuplicateMembership, "VOTER_ALREADY_EXISTS"),
        ("remove", MembershipReferenced, "RESOURCE_CONFLICT"),
    ],
)
def test_service_translates_repository_conflicts_without_committing(operation, port_error, code):
    uow = MagicMock()
    uow.__enter__.return_value = uow
    uow.roster.election.return_value = ElectionSnapshot(10, "DRAFT")
    now = datetime.now(UTC)
    uow.users.by_id.return_value = UserAccount(
        UserIdentity(42, "voter", "Voter", "USER", "ACTIVE", now, now), "dummy"
    )
    uow.roster.membership.return_value = None if operation == "add" else MagicMock()
    uow.roster.participation_count.return_value = 0
    getattr(uow.roster, operation).side_effect = port_error()
    service = RosterService(lambda: uow)
    with pytest.raises(AppError) as caught:
        if operation == "add":
            service.add_voter(10, 42, 1)
        else:
            service.remove_voter(10, 42)
    assert caught.value.code == code
    assert not hasattr(caught.value, "status_code")
    uow.commit.assert_not_called()
    assert uow.__exit__.call_args.args[0] is AppError
