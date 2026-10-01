"""Create baseline tables explicitly; the web application never runs DDL."""

import sys
from pathlib import Path

# Preserve direct execution: python database/init/01_init_schema.py.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.models import Base  # noqa: E402


def main() -> None:
    from env_config import load_settings
    from sqlalchemy import create_engine

    settings = load_settings()
    engine = create_engine(settings.database_url(), pool_pre_ping=True)
    try:
        Base.metadata.create_all(engine)
    finally:
        engine.dispose()
    print("Database tables created successfully.")


if __name__ == "__main__":
    main()
