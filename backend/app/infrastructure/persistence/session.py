from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker


def create_database_engine(database_url: URL) -> Engine:
    return create_engine(
        database_url,
        pool_pre_ping=True,
        pool_recycle=1800,
        echo=False,
        hide_parameters=True,
        connect_args={
            "init_command": "SET time_zone = '+00:00'",
            "connect_timeout": 5,
            "read_timeout": 10,
            "write_timeout": 10,
        },
    )


def create_session_factory(engine: Engine) -> sessionmaker:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
