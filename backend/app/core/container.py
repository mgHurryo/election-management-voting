from sqlalchemy import Engine

from app.core.config import Settings
from app.core.security import TokenManager
from app.db.session import create_database_engine, create_session_factory
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.services.health import HealthService
from app.services.identity import IdentityService
from app.services.roster import RosterService


class Container:
    """Composition root: only this module wires HTTP services to persistence."""

    def __init__(self, settings: Settings, engine: Engine | None = None) -> None:
        self.engine = engine if engine is not None else create_database_engine(settings)
        self.session_factory = create_session_factory(self.engine)
        self.identity = IdentityService(self.unit_of_work, TokenManager(settings))
        self.health = HealthService(self.unit_of_work)
        self.roster = RosterService(self.unit_of_work)
        self._owns_engine = engine is None

    def unit_of_work(self) -> SqlAlchemyUnitOfWork:
        return SqlAlchemyUnitOfWork(self.session_factory)

    def close(self) -> None:
        if self._owns_engine:
            self.engine.dispose()
