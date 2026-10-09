import ast
import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

from app.api.errors import APPLICATION_ERROR_STATUS

ROOT = Path(__file__).parents[2] / "app"
LEGACY = ("app.core", "app.db", "app.models", "app.repositories", "app.services")
HTTP = ("fastapi", "starlette", "app.api", "app.schemas")
DATABASE = ("sqlalchemy", "pymysql")
FORBIDDEN = {
    "domain": (
        "app.application",
        "app.infrastructure",
        "app.bootstrap",
        *HTTP,
        *DATABASE,
        "jwt",
        "bcrypt",
        "pydantic",
        "pydantic_settings",
    ),
    "application": (
        "app.infrastructure",
        "app.bootstrap",
        *HTTP,
        *DATABASE,
        "jwt",
        "bcrypt",
        "pydantic",
        "pydantic_settings",
    ),
    "api": ("app.infrastructure", "app.bootstrap", *DATABASE),
    "schemas": ("app.application", "app.infrastructure", "app.bootstrap", *DATABASE),
    "infrastructure": ("app.bootstrap", "app.application.services", *HTTP),
    "infrastructure/persistence/repositories": ("app.application.errors",),
    "bootstrap": (),
}


def imported_names(node, package):
    if isinstance(node, ast.Import):
        return [alias.name for alias in node.names]
    if isinstance(node, ast.ImportFrom):
        module = node.module or ""
        if node.level:
            module = importlib.util.resolve_name("." * node.level + module, package)
        # Include imported symbols so 'from app import infrastructure' cannot bypass the guard.
        return [module, *(module + "." + alias.name for alias in node.names)]
    return []


def violations(source, package, forbidden):
    return [
        name
        for node in ast.walk(ast.parse(source))
        for name in imported_names(node, package)
        if any(name == prefix or name.startswith(prefix + ".") for prefix in forbidden)
    ]


def test_layer_dependencies_follow_inward_direction():
    for layer, forbidden in FORBIDDEN.items():
        paths = list((ROOT / layer).rglob("*.py"))
        assert paths, f"Missing layer: {layer}"
        for path in paths:
            package = ".".join(("app", *path.relative_to(ROOT).parent.parts))
            assert not violations(
                path.read_text(encoding="utf-8"), package, (*forbidden, *LEGACY)
            ), path


@pytest.mark.parametrize(
    "source",
    [
        "import app.infrastructure.persistence",
        "from app.infrastructure.persistence import session",
        "from app import infrastructure",
        "from ...infrastructure import security",
    ],
)
def test_dependency_guard_detects_absolute_and_relative_bypasses(source):
    assert violations(source, "app.application.services", ("app.infrastructure",))


def test_domain_and_application_import_without_infrastructure_or_http():
    # A fresh interpreter catches transitive coupling hidden by pre-imported test fixtures.
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            """
import sys
import app.domain.identity
import app.domain.roster
import app.application.services.identity
import app.application.services.roster
import app.application.services.health
for name in sys.modules:
    assert not name.startswith(('app.infrastructure', 'app.bootstrap', 'sqlalchemy',
                                'pymysql', 'fastapi', 'starlette', 'jwt', 'bcrypt')), name
""",
        ],
        cwd=ROOT.parent,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr


def test_repositories_do_not_own_transaction_lifecycle():
    for path in (ROOT / "infrastructure/persistence/repositories").rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                assert node.func.attr not in {"commit", "rollback", "close"}, path


def test_all_application_error_codes_have_http_mappings():
    for path in ROOT.rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                if node.func.id == "AppError" and node.args:
                    assert isinstance(node.args[0], ast.Constant), path
                    assert node.args[0].value in APPLICATION_ERROR_STATUS, path
