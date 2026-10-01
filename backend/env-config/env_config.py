"""Central environment configuration for the database bootstrap scripts.

This module is the single place that knows how to locate the ``.env`` file,
load it, validate the required keys, and expose them as a typed object. The
numbered initialization scripts (``00_init_database.py``, ``01_init_schema.py``)
import from here instead of each re-implementing ``load_dotenv`` and the
``require_*`` validators, so the expected configuration lives in one place.

The variable names follow ARCHITECTURE_CN.md sections 4.11 and 13.5:

- ``DB_HOST`` / ``DB_PORT`` are the shared MySQL server location, used by both
  the admin bootstrap connection and the runtime application connection.
- ``DB_ADMIN_USER`` / ``DB_ADMIN_PASSWORD`` are the administrator (or dedicated
  migration) credentials used only to ``CREATE DATABASE`` / ``CREATE USER`` /
  ``GRANT``. They are kept separate from the runtime account on purpose.
- ``DB_NAME`` / ``DB_USER`` / ``DB_PASSWORD`` describe the target database and
  the least-privilege application account (``election_app``).
- ``DB_USER_HOST`` and ``DB_CHARSET`` are bootstrap extras that the architecture
  document fixes by convention, so they are optional here with safe defaults.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL


ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9_]+$")
HOST_RE = re.compile(r"^[A-Za-z0-9_.:%-]+$")

DRIVERNAME = "mysql+pymysql"



DEFAULT_DB_USER_HOST = "localhost"
DEFAULT_DB_CHARSET = "utf8mb4"


def require_env(name: str) -> str:
    """Return a non-empty environment variable or raise a clear error."""
    value = os.getenv(name)
    if value is None or not value.strip():
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value.strip()


def optional_env(name: str, default: str) -> str:
    """Return a non-empty environment variable or ``default`` when unset."""
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return value.strip()


def require_identifier(value: str, name: str) -> str:
    """Validate a value safe to inline into a SQL identifier context."""
    if not IDENTIFIER_RE.fullmatch(value):
        raise ValueError(f"{name} contains unsupported characters: {value!r}")
    return value


def require_host(value: str, name: str) -> str:
    """Validate a MySQL account host pattern (e.g. ``%``, ``localhost``)."""
    if not HOST_RE.fullmatch(value):
        raise ValueError(f"{name} contains unsupported characters: {value!r}")
    return value


@dataclass(frozen=True)
class DatabaseSettings:
    """Validated database configuration sourced from ``.env``."""

    host: str
    port: int
    admin_user: str
    admin_password: str
    db_name: str
    db_user: str
    db_password: str
    db_user_host: str
    db_charset: str

    def admin_url(self) -> URL:
        """Server-level admin URL (no database selected).

        Used by ``00_init_database.py`` to create the database and the
        application account.
        """
        return URL.create(
            drivername=DRIVERNAME,
            username=self.admin_user,
            password=self.admin_password,
            host=self.host,
            port=self.port,
        )

    def database_url(self) -> URL:
        """Admin URL bound to the target database with the configured charset.

        Used by ``01_init_schema.py`` to create the schema.
        """
        return URL.create(
            drivername=DRIVERNAME,
            username=self.admin_user,
            password=self.admin_password,
            host=self.host,
            port=self.port,
            database=self.db_name,
            query={"charset": self.db_charset},
        )


def load_settings(env_path: Path | None = None) -> DatabaseSettings:
    """Load ``.env`` and return fully validated :class:`DatabaseSettings`.

    ``env_path`` may be overridden (e.g. in tests); it defaults to
    :data:`ENV_PATH`.
    """
    load_dotenv(env_path or ENV_PATH)

    return DatabaseSettings(
        host=require_env("DB_HOST"),
        port=int(require_env("DB_PORT")),
        admin_user=require_env("DB_ADMIN_USER"),
        admin_password=require_env("DB_ADMIN_PASSWORD"),
        db_name=require_identifier(require_env("DB_NAME"), "DB_NAME"),
        db_user=require_identifier(require_env("DB_USER"), "DB_USER"),
        db_password=require_env("DB_PASSWORD"),
        db_user_host=require_host(
            optional_env("DB_USER_HOST", DEFAULT_DB_USER_HOST),
            "DB_USER_HOST",
        ),
        db_charset=optional_env("DB_CHARSET", DEFAULT_DB_CHARSET),
    )
