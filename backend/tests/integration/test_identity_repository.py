import pytest
from sqlalchemy import select, update

from app.db.session import create_session_factory
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.models import User


def test_repository_returns_domain_snapshot_without_injection(engine):
    with SqlAlchemyUnitOfWork(create_session_factory(engine)) as uow:
        account = uow.users.by_username("voter")
        assert account.identity.id == 21
        assert account.identity.created_at.utcoffset().total_seconds() == 0
        assert uow.users.by_username("' OR 1=1 --") is None
        assert uow.users.by_id(999) is None
    assert account.identity.username == "voter"  # safe after session close
    assert "2b$" not in repr(account)


@pytest.mark.parametrize("outcome", ["commit", "no_commit", "exception"])
def test_unit_of_work_transaction_ownership(engine, outcome):
    factory = create_session_factory(engine)
    try:
        with SqlAlchemyUnitOfWork(factory) as uow:
            # Test infrastructure only: exercise the real session transaction explicitly.
            uow._session.execute(update(User).where(User.id == 21).values(display_name="Changed"))
            if outcome == "commit":
                uow.commit()
            elif outcome == "exception":
                raise RuntimeError("abort")
    except RuntimeError:
        assert outcome == "exception"
    with factory() as session:
        name = session.scalar(select(User.display_name).where(User.id == 21))
        assert name == ("Changed" if outcome == "commit" else "Voter")
