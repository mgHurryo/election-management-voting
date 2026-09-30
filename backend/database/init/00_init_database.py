from __future__ import annotations

from sqlalchemy import create_engine

from env_config import load_settings


def main() -> None:
    settings = load_settings()

    engine = create_engine(
        settings.admin_url(),
        isolation_level="AUTOCOMMIT",
        pool_pre_ping=True,
    )

    with engine.connect() as conn:
        conn.exec_driver_sql(
            f"""
            CREATE DATABASE IF NOT EXISTS `{settings.db_name}`
            CHARACTER SET utf8mb4
            COLLATE utf8mb4_unicode_ci
            """
        )

        conn.exec_driver_sql(
            f"""
            CREATE USER IF NOT EXISTS '{settings.db_user}'@'{settings.db_user_host}'
            IDENTIFIED BY %s
            """,
            (settings.db_password,),
        )

        conn.exec_driver_sql(
            f"""
            GRANT SELECT, INSERT, UPDATE, DELETE
            ON `{settings.db_name}`.*
            TO '{settings.db_user}'@'{settings.db_user_host}'
            """
        )

    engine.dispose()

    print(f"Database ready: {settings.db_name}")
    print(
        "Application database user ready: "
        f"{settings.db_user}@{settings.db_user_host}"
    )


if __name__ == "__main__":
    main()
