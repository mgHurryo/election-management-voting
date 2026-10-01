"""Offline bootstrap regression tests; never read real .env files or use MySQL."""

from __future__ import annotations

import contextlib
import importlib
import importlib.machinery
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from sqlalchemy import create_mock_engine


BACKEND = Path(__file__).resolve().parents[1]
INIT_DIR = BACKEND / "database" / "init"

# Match direct script invocation without changing production import paths.
with patch.object(sys, "path", [str(INIT_DIR), *sys.path]):
    env_config = importlib.import_module("env_config")
    database = importlib.import_module("00_init_database")
    schema = importlib.import_module("01_init_schema")

TEST_ENV = {
    "DB_HOST": "localhost",
    "DB_PORT": "3306",
    "DB_ADMIN_USER": "test_admin",
    "DB_ADMIN_PASSWORD": "test-only-admin",
    "DB_NAME": "test_election",
    "DB_USER": "test_app",
    "DB_PASSWORD": "test-only-app",
}


class ConfigurationTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, TEST_ENV, clear=True)
        environment.start()
        self.addCleanup(environment.stop)
        directory = tempfile.TemporaryDirectory(prefix="bootstrap-test-")
        self.addCleanup(directory.cleanup)
        self.env_path = Path(directory.name) / ".env"

    def write_env_file(self):
        self.env_path.write_text(
            "\n".join(f"{key}={value}" for key, value in TEST_ENV.items()),
            encoding="utf-8",
        )

    def test_no_unused_configuration_copy(self):
        self.assertFalse(
            (BACKEND / "env-config" / "env_config.py").exists(),
            "Reuse database/init/env_config.py instead of a disconnected copy.",
        )

    def test_default_env_path_is_backend_dotenv(self):
        self.assertEqual(env_config.ENV_PATH, BACKEND / ".env")

    def test_default_path_is_independent_of_working_directory(self):
        # Patch the file loader so this check cannot read the developer's .env.
        with contextlib.chdir(self.env_path.parent):
            with patch.object(env_config, "load_dotenv") as load_dotenv:
                settings = env_config.load_settings()
        load_dotenv.assert_called_once_with(BACKEND / ".env")
        self.assertEqual(settings.db_name, TEST_ENV["DB_NAME"])

    def test_explicit_dotenv_path_and_defaults(self):
        self.write_env_file()
        with patch.dict(os.environ, {}, clear=True):
            settings = env_config.load_settings(self.env_path)
        self.assertEqual(settings.host, TEST_ENV["DB_HOST"])
        self.assertEqual(settings.port, 3306)
        self.assertEqual(settings.db_name, TEST_ENV["DB_NAME"])
        self.assertEqual(settings.db_user_host, "localhost")
        self.assertEqual(settings.db_charset, "utf8mb4")

    def test_process_environment_takes_precedence_over_file(self):
        self.write_env_file()
        with patch.dict(os.environ, {"DB_NAME": "process_database"}, clear=True):
            settings = env_config.load_settings(self.env_path)
        self.assertEqual(settings.db_name, "process_database")
        self.assertEqual(settings.db_user, TEST_ENV["DB_USER"])

    def test_missing_required_keys_are_rejected(self):
        for name in TEST_ENV:
            with self.subTest(name=name), patch.dict(os.environ, TEST_ENV, clear=True):
                del os.environ[name]
                with self.assertRaisesRegex(RuntimeError, f"variable: {name}$"):
                    env_config.load_settings(self.env_path)

    def test_blank_required_values_are_rejected(self):
        for name in TEST_ENV:
            with self.subTest(name=name), patch.dict(os.environ, {name: "  "}):
                with self.assertRaisesRegex(RuntimeError, f"variable: {name}$"):
                    env_config.load_settings(self.env_path)

    def test_optional_blank_values_use_defaults(self):
        with patch.dict(os.environ, {"DB_USER_HOST": "  ", "DB_CHARSET": ""}):
            settings = env_config.load_settings(self.env_path)
        self.assertEqual(settings.db_user_host, "localhost")
        self.assertEqual(settings.db_charset, "utf8mb4")

    def test_invalid_sql_identifiers_are_rejected(self):
        for name in ("DB_NAME", "DB_USER"):
            for value in ("invalid-name", "name`; SELECT 1; --"):
                with self.subTest(name=name, value=value):
                    with patch.dict(os.environ, {name: value}):
                        with self.assertRaisesRegex(ValueError, name):
                            env_config.load_settings(self.env_path)

    def test_invalid_account_hosts_are_rejected(self):
        for value in ("host'", "host name"):
            with self.subTest(value=value), patch.dict(os.environ, {"DB_USER_HOST": value}):
                with self.assertRaisesRegex(ValueError, "DB_USER_HOST"):
                    env_config.load_settings(self.env_path)

    def test_non_numeric_port_is_rejected(self):
        with patch.dict(os.environ, {"DB_PORT": "invalid"}):
            with self.assertRaises(ValueError):
                env_config.load_settings(self.env_path)

    def test_custom_bootstrap_options(self):
        options = {"DB_PORT": "3307", "DB_USER_HOST": "%", "DB_CHARSET": "utf8mb4"}
        with patch.dict(os.environ, options):
            settings = env_config.load_settings(self.env_path)
        self.assertEqual(settings.port, 3307)
        self.assertEqual(settings.db_user_host, "%")
        self.assertEqual(settings.db_charset, "utf8mb4")

    def test_urls_use_admin_credentials_and_scope_database(self):
        settings = env_config.load_settings(self.env_path)
        admin_url = settings.admin_url()
        database_url = settings.database_url()
        for url in (admin_url, database_url):
            self.assertEqual(url.drivername, "mysql+pymysql")
            self.assertEqual(url.username, TEST_ENV["DB_ADMIN_USER"])
            self.assertEqual(url.password, TEST_ENV["DB_ADMIN_PASSWORD"])
            self.assertEqual(url.host, TEST_ENV["DB_HOST"])
            self.assertEqual(url.port, 3306)
        self.assertIsNone(admin_url.database)
        self.assertEqual(database_url.database, TEST_ENV["DB_NAME"])
        self.assertEqual(database_url.query["charset"], "utf8mb4")


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.settings = env_config.DatabaseSettings(
            host="localhost",
            port=3306,
            admin_user="test_admin",
            admin_password="test-only-admin",
            db_name="test_election",
            db_user="test_app",
            db_password="test-only-app",
            db_user_host="localhost",
            db_charset="utf8mb4",
        )

    def test_entrypoint_imports_share_canonical_configuration(self):
        spec = importlib.machinery.PathFinder.find_spec("env_config", [str(INIT_DIR)])
        self.assertIsNotNone(spec)
        self.assertEqual(Path(spec.origin).resolve(), INIT_DIR / "env_config.py")
        self.assertEqual(Path(env_config.__file__).resolve(), INIT_DIR / "env_config.py")
        self.assertIs(database.load_settings, env_config.load_settings)

    def test_database_bootstrap_sql_parameters_output_and_disposal(self):
        engine = MagicMock()
        connection = engine.connect.return_value.__enter__.return_value
        output = io.StringIO()
        with (
            patch.object(database, "load_settings", return_value=self.settings),
            patch.object(database, "create_engine", return_value=engine) as create_engine,
            contextlib.redirect_stdout(output),
        ):
            database.main()
        create_engine.assert_called_once_with(
            self.settings.admin_url(), isolation_level="AUTOCOMMIT", pool_pre_ping=True
        )
        calls = connection.exec_driver_sql.call_args_list
        self.assertEqual(len(calls), 3)
        self.assertEqual(
            [" ".join(call.args[0].split()) for call in calls],
            [
                "CREATE DATABASE IF NOT EXISTS `test_election` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
                "CREATE USER IF NOT EXISTS 'test_app'@'localhost' IDENTIFIED BY %s",
                "GRANT SELECT, INSERT, UPDATE, DELETE "
                "ON `test_election`.* TO 'test_app'@'localhost'",
            ],
        )
        self.assertEqual(calls[1].args[1], (self.settings.db_password,))
        self.assertNotIn(self.settings.db_password, calls[1].args[0])
        connection_context = engine.connect.return_value
        connection_context.__exit__.assert_called_once_with(None, None, None)
        engine.dispose.assert_called_once_with()
        self.assertEqual(
            output.getvalue(),
            "Database ready: test_election\n"
            "Application database user ready: test_app@localhost\n",
        )

    def test_schema_bootstrap_uses_same_loader_and_disposes_engine(self):
        engine = MagicMock()
        output = io.StringIO()
        with (
            patch.object(env_config, "load_settings", return_value=self.settings) as load_settings,
            patch("sqlalchemy.create_engine", return_value=engine) as create_engine,
            patch.object(schema.Base.metadata, "create_all") as create_all,
            contextlib.redirect_stdout(output),
        ):
            schema.main()
        load_settings.assert_called_once_with()
        create_engine.assert_called_once_with(self.settings.database_url(), pool_pre_ping=True)
        create_all.assert_called_once_with(engine)
        engine.dispose.assert_called_once_with()
        self.assertEqual(output.getvalue(), "Database tables created successfully.\n")

    def test_configuration_failure_prevents_database_access(self):
        with (
            patch.object(database, "load_settings", side_effect=RuntimeError("test config")),
            patch.object(database, "create_engine") as create_engine,
        ):
            with self.assertRaisesRegex(RuntimeError, "test config"):
                database.main()
            create_engine.assert_not_called()
        with (
            patch.object(env_config, "load_settings", side_effect=RuntimeError("test config")),
            patch("sqlalchemy.create_engine") as create_engine,
        ):
            with self.assertRaisesRegex(RuntimeError, "test config"):
                schema.main()
            create_engine.assert_not_called()

    def test_schema_compiles_for_mysql_without_connection(self):
        tables = schema.Base.metadata.tables
        self.assertEqual(
            set(tables),
            {
                "users", "elections", "election_candidates", "election_voters",
                "vote_participation", "ballots", "ballot_choices", "audit_logs",
            },
        )
        statements = []
        engine = create_mock_engine(
            "mysql+pymysql://",
            lambda ddl, *args, **kwargs: statements.append(
                str(ddl.compile(dialect=engine.dialect))
            ),
        )
        schema.Base.metadata.create_all(engine)
        table_statements = [sql for sql in statements if sql.lstrip().startswith("CREATE TABLE")]
        self.assertEqual(len(table_statements), len(tables))
        self.assertEqual(len(statements), len(tables) + sum(len(t.indexes) for t in tables.values()))
        ddl = "\n".join(table_statements)
        self.assertIn("chk_ballots_anonymous", ddl)
        self.assertIn("(is_anonymous = TRUE AND voter_id IS NULL)", ddl)
        self.assertIn("(is_anonymous = FALSE AND voter_id IS NOT NULL)", ddl)
        self.assertIn("privacy_mode IN ('FORCED_ANONYMOUS', 'OPTIONAL_ANONYMOUS', 'IDENTIFIED')", ddl)


if __name__ == "__main__":
    unittest.main()
