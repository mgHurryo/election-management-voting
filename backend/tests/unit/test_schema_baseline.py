from pathlib import Path

from sqlalchemy.dialects import mysql
from sqlalchemy.schema import CreateIndex, CreateTable

from app.models import Base


def test_mysql_ddl_matches_pre_framework_bootstrap():
    dialect = mysql.dialect()
    statements = []
    for table in Base.metadata.sorted_tables:
        statements.append(str(CreateTable(table).compile(dialect=dialect)).strip())
        statements.extend(
            sorted(
                str(CreateIndex(index).compile(dialect=dialect)).strip() for index in table.indexes
            )
        )
    actual = "\n\n".join(statements) + "\n"
    expected = (Path(__file__).parents[1] / "fixtures/mysql_schema.sql").read_text(encoding="utf-8")
    assert actual == expected
    assert len(Base.metadata.tables) == 8
