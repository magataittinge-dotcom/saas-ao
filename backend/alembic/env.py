"""Alembic env — autoload DATABASE_URL + Base.metadata.

We mirror the runtime engine: the URL comes from `config.get_settings()`
(read from the .env file, same as the rest of the app), and the metadata
comes from `database.Base` so that autogenerate works out of the box.

R14 : alembic est la source UNIQUE du schéma. main.py ne fait plus de DDL
ad hoc — en prod il exige seulement que la base soit à la head (fail fast) ;
en dev/test il crée le schéma via `create_all`. Toute évolution de schéma
passe par une nouvelle révision alembic.
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

# `rag_chunks` (corpus RAG pgvector) n'est PAS un modèle ORM : il est créé en
# DDL brut par la révision 0003 (extension pgvector, index HNSW, FTS français,
# type vector(N) non mappé par SQLAlchemy). On l'exclut donc de l'autogenerate
# et d'`alembic check` — sinon il apparaît en faux « removed table ». Sa gestion
# reste 100 % alembic (0003), la source unique est préservée.
_RAW_TABLES = {"rag_chunks"}


def _include_object(obj, name, type_, reflected, compare_to):
    if type_ == "table" and name in _RAW_TABLES:
        return False
    if type_ == "index" and getattr(obj, "table", None) is not None \
            and obj.table.name in _RAW_TABLES:
        return False
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_object=_include_object,
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
            include_object=_include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
