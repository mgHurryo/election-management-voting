from unittest.mock import Mock

from fastapi.testclient import TestClient

from app.infrastructure.persistence.session import create_database_engine
from app.main import create_app


def test_application_does_not_connect_or_run_ddl_on_start(settings, monkeypatch):
    engine = create_database_engine(settings.database_url())
    connect = Mock(side_effect=AssertionError("must not connect on startup"))
    dispose = Mock()
    monkeypatch.setattr(engine, "connect", connect)
    monkeypatch.setattr(engine, "dispose", dispose)
    monkeypatch.setattr(
        "app.bootstrap.container.create_database_engine", lambda database_url: engine
    )
    with TestClient(create_app(settings=settings)) as client:
        assert client.get("/health/live").status_code == 200
        assert client.get("/openapi.json").status_code == 200
    connect.assert_not_called()
    dispose.assert_called_once()
