"""Alembic env — autoload DATABASE_URL + Base.metadata.

We mirror the runtime engine: the URL comes from `config.get_settings()`
(read from the .env file, same as the rest of the app), and the metadata
comes from `database.Base` so that autogenerate works out of the box.

Reminder: the legacy `_ensure_schema_columns()` in main.py is still
called at startup as a *fallback* for dev environments that haven't run
`alembic upgrade head`. Production should rely on alembic.
"""
import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool
from alembic import context

# Make backend/ importable so we can pull config + Base.
_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

# Import settings *after* sys.path tweak so backend.config resolves.
from config import get_settings  # noqa: E402
import models  # noqa: E402,F401 — register every model with Base
from database import Base  # noqa: E402

config = context.config

# Honour the project-level DB URL even if alembic.ini ships a placeholder.
_db_url = os.environ.get("DATABASE_URL") or get_settings().DATABASE_URL
config.set_main_option("sqlalchemy.url", _db_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
