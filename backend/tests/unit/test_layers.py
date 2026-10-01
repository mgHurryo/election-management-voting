import ast
from pathlib import Path


def test_api_and_services_do_not_bypass_layer_boundaries():
    root = Path(__file__).parents[2] / "app"
    forbidden = {
        "api": ("sqlalchemy", "pymysql", "app.db", "app.repositories", "app.models.entities"),
        "services": ("fastapi", "starlette", "sqlalchemy", "pymysql", "app.repositories"),
        "repositories": ("fastapi", "starlette", "app.api", "app.services"),
    }
    for layer, modules in forbidden.items():
        for path in (root / layer).glob("*.py"):
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
                names = []
                if isinstance(node, ast.Import):
                    names = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom):
                    names = [node.module or ""]
                for name in names:
                    assert not any(
                        name == module or name.startswith(module + ".") for module in modules
                    ), f"Layer violation: {path.name}: {name}"
