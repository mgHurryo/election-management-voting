from sqlalchemy import Engine

from app.application.services.health import HealthService
from app.application.services.identity import IdentityService
from app.application.services.roster import RosterService
from app.bootstrap.config import Settings
from app.infrastructure.persistence.session import create_database_engine, create_session_factory
from app.infrastructure.persistence.unit_of_work import SqlAlchemyUnitOfWork
from app.infrastructure.security import TokenManager, hash_password, verify_password


class Container:
    """Composition root: only this module wires HTTP services to persistence."""

    def __init__(self, settings: Settings, engine: Engine | None = None) -> None:
        self.engine = (
            engine if engine is not None else create_database_engine(settings.database_url())
        )
        self.session_factory = create_session_factory(self.engine)
        self.identity = IdentityService(
            self.unit_of_work,
            TokenManager(
                secret=settings.jwt_secret.get_secret_value(),
                expire_minutes=settings.jwt_expire_minutes,
            ),
            verify_password=verify_password,
            # One cost-12 hash per application, rather than per failed request.
            dummy_hash=hash_password("DummyVerification123"),
        )
        self.health = HealthService(self.unit_of_work)
        self.roster = RosterService(self.unit_of_work)
        self._owns_engine = engine is None

    def unit_of_work(self) -> SqlAlchemyUnitOfWork:
        return SqlAlchemyUnitOfWork(self.session_factory)

    def close(self) -> None:
        if self._owns_engine:
            self.engine.dispose()
