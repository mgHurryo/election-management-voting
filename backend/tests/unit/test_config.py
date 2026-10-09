import pytest
from pydantic import ValidationError

from app.bootstrap.config import Settings


@pytest.mark.parametrize(
    "overrides",
    [
        {"db_user": "root"},
        {"db_password": "change-me"},
        {"jwt_secret": "short"},
        {"jwt_expire_minutes": 0},
        {"db_port": 70000},
        {"db_host": " "},
        {"frontend_origin": "*"},
        {"frontend_origin": "https://example.test/path"},
        {"frontend_origin": "https://user:pass@example.test"},
    ],
)
def test_invalid_config_is_rejected(settings, overrides):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **(settings.model_dump() | overrides))


def test_database_url_preserves_special_password_characters(settings):
    settings = Settings(_env_file=None, **(settings.model_dump() | {"db_password": "p@ss:/?#word"}))
    assert settings.database_url().password == "p@ss:/?#word"
    assert settings.database_url().username == "test_app"
    assert "p@ss" not in str(settings.database_url())
    assert "test-only-jwt" not in repr(settings)
    assert "db_admin_user" not in Settings.model_fields


def test_settings_load_dotenv_without_exposing_bootstrap_config(settings, tmp_path, monkeypatch):
    for key in Settings.model_fields:
        monkeypatch.delenv(key.upper(), raising=False)
    env = tmp_path / ".env"
    env.write_text(
        "DB_HOST=localhost\nDB_NAME=election\nDB_USER=election_app\n"
        "DB_PASSWORD=non-production-password\nDB_ADMIN_USER=root\n"
        "DB_ADMIN_PASSWORD=never-used-by-runtime\n"
        "JWT_SECRET=test-signing-key-at-least-32-bytes-long\n"
        "FRONTEND_ORIGIN=http://localhost:5173\n",
        encoding="utf-8",
    )
    loaded = Settings(_env_file=env)
    assert loaded.jwt_expire_minutes == 60
    assert loaded.db_user == "election_app"
    assert "never-used" not in repr(loaded)
