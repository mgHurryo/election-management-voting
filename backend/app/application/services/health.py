from collections.abc import Callable

from app.application.errors import AppError
from app.application.ports import UnitOfWork


class HealthService:
    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory

    def ready(self) -> dict[str, str]:
        try:
            with self._uow_factory() as uow:
                uow.health.ping()
        except Exception as exc:
            raise AppError("SERVICE_UNAVAILABLE", "Service is not ready.") from exc
        return {"status": "ready"}
