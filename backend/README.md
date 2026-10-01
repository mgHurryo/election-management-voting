# Backend foundation

English / [简体中文](README_CN.md)

This is the first implementation slice of Architecture v0.2 / SRS v0.1. It is
**not the complete voting MVP**. No election, candidate, roster, vote or result
endpoint returns a placeholder success. Those operations remain unregistered.

## Implemented scope

- FastAPI application factory, `/api/v1` routing, generated development OpenAPI.
- API → service → repository; a composition root wires dependencies. Services
  own unit-of-work transactions; repositories never commit or access HTTP types.
- Validated environment configuration, least-privilege MySQL runtime account,
  connection pooling, UTC MySQL sessions, deterministic connection disposal.
- All eight existing ORM tables in one shared metadata definition, imported by
  both runtime and bootstrap. No schema change or automatic startup DDL.
- JSON success/error envelopes, sanitized validation/404/405/500 handling,
  strict request fields, explicit CORS origin and `Cache-Control: no-store`.
- bcrypt cost 12, configurable JWT lifetime (default 60 minutes), per-request
  account/role checks. No registration, refresh tokens or hardcoded demo accounts.

| Route | Access | Status |
| --- | --- | --- |
| `POST /api/v1/auth/login` | Public JSON username/password | Implemented |
| `GET /api/v1/auth/me` | Bearer token; account must remain ACTIVE | Implemented |
| `GET /health/live` | Public operational probe, no database access | Implemented |
| `GET /health/ready` | Public operational probe, database `SELECT 1` | Implemented |
| Remaining 18 API.md operations | Not registered | Planned |

Health routes are operational additions **outside `/api/v1`**. Readiness reports
connectivity, not schema compatibility, migrations or voting readiness. An
unavailable database returns 503 `SERVICE_UNAVAILABLE` without connection details.

## Quick start

Prerequisites: Python 3.12+, uv and a prepared MySQL/InnoDB database. From this directory:

```powershell
uv sync --locked
Copy-Item .env.example .env
```

Edit `.env` before running: set the application's database password, a random
`JWT_SECRET` of at least 32 bytes, and one exact `FRONTEND_ORIGIN` without a trailing
slash. Blank/placeholder secrets and `DB_USER=root` are rejected. Generate a key:

```powershell
uv run python -c "import secrets; print(secrets.token_urlsafe(48))"
```

The `.env` path is resolved relative to this backend directory, not the caller's
working directory. Environment variables override it. Runtime does not read or
require `DB_ADMIN_USER` / `DB_ADMIN_PASSWORD`; those belong only to explicit
bootstrap. Never commit `.env`, copy real credentials into tests, or use a
production database for tests.

For a **new, authorized database only**, set bootstrap admin credentials and run:

```powershell
uv run python database/init/00_init_database.py
uv run python database/init/01_init_schema.py
```

These scripts retain their previous command paths. `create_all` initializes a
baseline; it does not migrate an existing database. Prepare accounts through an
authorized deployment/seed workflow. No accounts are created by startup. That
workflow should call `app.core.security.hash_password`: ADR-009 requires 8+
characters, at most 72 UTF-8 bytes, at least one letter and one digit. Passwords
are never trimmed. Login verifies existing hashes without reapplying a new-user
complexity policy; over-72-byte input is rejected as invalid credentials.

```powershell
uv run uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000 --no-access-log
```

Use `/docs` or `/openapi.json` in development. With `APP_ENV=production`, both are
disabled. Liveness and docs can start without connecting to MySQL; readiness and
identity need the database. Stop the process with Ctrl+C. Do not enable SQL echo,
request-body/token logging or proxy query logging for authentication/voting.
Use TLS and deployment-level login rate limiting before any public deployment;
rate limiting and browser token handling are not implemented by this backend slice.

## Tests, lint and build

```powershell
uv run ruff check .
uv run ruff format --check .
uv run pytest --cov=app --cov-report=term-missing
uv build
```

Fast identity integration tests use SQLite only for the `users` table. They do
**not** establish MySQL locking, voting concurrency or anonymous-storage correctness.
A checked-in DDL snapshot verifies that the eight MySQL tables/indexes remain
identical to the original bootstrap schema at commit `1153335`.

For actual MySQL integration, explicitly supply an **empty, disposable** database
whose name ends in `_test`. The fixture creates and removes only its eight tables:

```powershell
$env:TEST_MYSQL_URL = 'mysql+pymysql://test_user:<URL-encoded-password>@127.0.0.1:3306/election_test?charset=utf8mb4'
uv run pytest -m mysql
```

Without this variable, three MySQL tests are skipped, not reported as verified.
The backend CI provisions its own MySQL service and runs these tests in addition
to lint, build and the full suite. No existing repository checks are disabled.
The locked Starlette version currently emits an httpx TestClient deprecation
warning; it is visible rather than suppressed and does not fail the tests.

## Code map and next slices

```text
app/
  main.py                  application factory/lifecycle
  api/                     routing, HTTP dependencies, serializers/errors
  schemas/                 Pydantic HTTP contracts and shared ID/UTC types
  services/                business operations and repository/UoW protocols
  repositories/            parameterized ORM queries and domain snapshots
  models/                  shared eight-table schema + identity domain values
  db/                      engine, sessions and explicit unit of work
  core/                    settings, JWT/password helpers and composition root
```

| Next module | Routes / service / repository responsibilities |
| --- | --- |
| Elections | Create/list/detail/patch, DRAFT transitions, atomic initial membership |
| Candidates | DRAFT-only CRUD, required introduction and candidate ownership |
| Voters | DRAFT-only roster, ACTIVE USER validation and quota fixed to one |
| Voting | Ballot/participation, locks, time/quota checks, anonymous atomic writes |
| Results | CLOSED tally, publication visibility, tie/zero-vote policy |

Add each module's schemas, service and repository before registering its routes in
`app/api/router.py`. Tests guard against API database access and service HTTP imports.
Keep transactions inside services, especially participation + ballot + choice.
Implement MySQL row-lock/concurrency tests before accepting voting correctness.
Do not enable reserved anonymity modes or multi-vote quotas from the DB schema.

ADR-009 already resolves bcrypt, default token lifetime and password policy;
API.md D-08's older wording is not a reason to invent alternatives. Other draft
API decisions (notably D-06 tie/zero-vote publication) remain to be confirmed.
