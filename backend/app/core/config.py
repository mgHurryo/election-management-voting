from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        hide_input_in_errors=True,
    )

    app_env: Literal["development", "test", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    db_host: str
    db_port: int = 3306
    db_name: str
    db_user: str
    db_password: SecretStr
    jwt_secret: SecretStr
    jwt_expire_minutes: int = 60
    frontend_origin: str

    @field_validator("db_host", "db_name", "db_user")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value.strip()

    @field_validator("db_user")
    @classmethod
    def no_root(cls, value: str) -> str:
        if value.casefold() == "root":
            raise ValueError("runtime must use a dedicated application account")
        return value

    @field_validator("db_password", "jwt_secret")
    @classmethod
    def no_placeholder(cls, value: SecretStr) -> SecretStr:
        secret = value.get_secret_value()
        if not secret.strip() or secret.lower().startswith(("change-me", "replace-me")):
            raise ValueError("replace the placeholder with a real secret")
        return value

    @field_validator("jwt_secret")
    @classmethod
    def strong_signing_key(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value().encode("utf-8")) < 32:
            raise ValueError("JWT_SECRET must be at least 32 bytes")
        return value

    @field_validator("db_port")
    @classmethod
    def port_range(cls, value: int) -> int:
        if not 1 <= value <= 65535:
            raise ValueError("must be a valid TCP port")
        return value

    @field_validator("jwt_expire_minutes")
    @classmethod
    def positive_lifetime(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("must be positive")
        return value

    @field_validator("frontend_origin")
    @classmethod
    def explicit_origin(cls, value: str) -> str:
        parsed = urlsplit(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.path
            or parsed.query
            or parsed.fragment
            or "*" in value
        ):
            raise ValueError("must be one explicit HTTP(S) origin without a path")
        try:
            _ = parsed.port
        except ValueError as exc:
            raise ValueError("invalid origin port") from exc
        return value

    def database_url(self) -> URL:
        # Bootstrap/admin credentials are intentionally absent from runtime settings.
        return URL.create(
            "mysql+pymysql",
            username=self.db_user,
            password=self.db_password.get_secret_value(),
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
            query={"charset": "utf8mb4"},
        )
