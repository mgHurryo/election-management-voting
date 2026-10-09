from datetime import datetime, timedelta

import pytest
from sqlalchemy import insert
from sqlalchemy.exc import IntegrityError

from app.application.ports import DuplicateMembership
from app.infrastructure.persistence.orm import Election, ElectionVoter
from app.infrastructure.persistence.session import create_session_factory
from app.infrastructure.persistence.unit_of_work import SqlAlchemyUnitOfWork


def test_sqlite_duplicate_mapping_preserves_other_constraint_failures(engine):
    Election.__table__.create(engine)
    ElectionVoter.__table__.create(engine)
    now = datetime(2026, 10, 9)
    with engine.begin() as connection:
        connection.execute(
            insert(Election).values(
                id=10,
                title="Constraint test",
                position_title="Chair",
                created_by=22,
                privacy_mode="FORCED_ANONYMOUS",
                starts_at=now,
                ends_at=now + timedelta(hours=1),
            )
        )
    factory = create_session_factory(engine)
    with SqlAlchemyUnitOfWork(factory) as uow:
        uow.roster.add(10, 21, 1)
        uow.commit()
    with pytest.raises(DuplicateMembership), SqlAlchemyUnitOfWork(factory) as uow:
        uow.roster.add(10, 21, 1)
    with pytest.raises(IntegrityError), SqlAlchemyUnitOfWork(factory) as uow:
        uow.roster.add(10, 22, 0)
