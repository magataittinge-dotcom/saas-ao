"""Phase 0 (rapport production-ready) — O5 : pool Postgres borné.

Avant : pool_size=10 + max_overflow=20 = 30 connexions max/process,
× (4 workers API + 2 process Celery prefork) = 180 > max_connections=100
documenté (DEPLOYMENT.md §3) → `FATAL: too many connections` sous charge.
Après : 10 + 5 = 15/process → même à 4 workers API : 4×15 + 2×15 = 90 ≤ 97
(100 moins ~3 connexions réservées superuser). + pool_recycle contre les
connexions zombies après un restart Postgres.
"""
from sqlalchemy.pool import StaticPool

from database import build_engine_kwargs


def test_postgres_pool_bounded_for_max_connections_100():
    kw = build_engine_kwargs("postgresql://u:p@localhost:5432/db")
    assert kw["pool_size"] == 10
    assert kw["max_overflow"] == 5
    assert kw["pool_recycle"] == 1800
    assert kw["pool_pre_ping"] is True
    # Pire cas documenté : 4 workers API + 2 Celery = 6 process.
    assert (kw["pool_size"] + kw["max_overflow"]) * 6 <= 97


def test_sqlite_memory_uses_static_pool():
    """`:memory:` n'existe qu'au sein d'UNE connexion → StaticPool obligatoire."""
    kw = build_engine_kwargs("sqlite:///:memory:")
    assert kw["poolclass"] is StaticPool
    assert kw["connect_args"]["check_same_thread"] is False


def test_sqlite_file_keeps_regular_pool():
    """SQLite fichier (tests) : pool normal = une connexion PAR thread (R15)."""
    kw = build_engine_kwargs("sqlite:////tmp/exemple.db")
    assert "poolclass" not in kw
    assert kw["connect_args"]["check_same_thread"] is False
