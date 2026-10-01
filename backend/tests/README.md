# Database bootstrap regression tests

Run these commands from the repository root with Python 3.12 or 3.14:

```sh
python -m pip install -r backend/database/init/requirements-db.txt
python -m compileall -q backend/database/init backend/tests
python -B -m unittest discover -s backend/tests -p "test_*.py" -v
```

The tests use the standard-library `unittest` runner and the existing bootstrap
requirements; no additional test dependency, Git history, credentials, or MySQL
server is needed. The same commands run in the `Database bootstrap` PR workflow.

Both initialization scripts continue to share
`backend/database/init/env_config.py`. That module resolves `backend/.env`
relative to its own location, not the caller's working directory. There is no
second loader in `backend/env-config/` and no import-path migration.

Tests cover the single-loader contract, the default/explicit environment-file
paths, process-environment precedence, configuration validation, parameterized
bootstrap SQL, successful engine disposal, and offline MySQL DDL compilation.
Environment-file tests use only temporary dummy files. Bootstrap entrypoints use
mocked engines and settings; the scripts are never executed against a real
server, and the developer's actual `.env` files are not read.

These are unit/contract checks, **not real MySQL integration tests**. They do not
verify server permissions, server-version compatibility, or an actual migration.
