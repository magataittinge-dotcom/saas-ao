from urllib.parse import urlparse

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

from config import get_settings

settings = get_settings()


def build_engine_kwargs(database_url: str) -> dict:
    """kwargs de create_engine selon le type de base — extrait pour être
    testable sans connexion (O5, audit prod)."""
    scheme = urlparse(database_url).scheme
    is_sqlite = scheme.startswith("sqlite")
    is_sqlite_memory = is_sqlite and (
        ":memory:" in database_url or "mode=memory" in database_url
    )
    kwargs: dict = {"pool_pre_ping": True}
    if scheme.startswith("postgres"):
        # O5 : (pool_size + max_overflow) × nb de process ≤ max_connections.
        # 15 conn max/process × (4 workers API + 2 Celery) = 90 < 100 (défaut
        # Postgres, moins ~3 réservées superuser). pool_recycle : ne jamais
        # garder une connexion > 30 min (zombies après restart Postgres).
        kwargs.update({
            "pool_size": 10,
            "max_overflow": 5,
            "pool_recycle": 1800,
            "connect_args": {"options": "-c client_encoding=utf8"},
        })
    elif is_sqlite:
        kwargs["connect_args"] = {"check_same_thread": False}
        if is_sqlite_memory:
            # `:memory:` n'existe qu'au sein d'UNE connexion → StaticPool obligatoire.
            from sqlalchemy.pool import StaticPool
            kwargs["poolclass"] = StaticPool
        # SQLite sur fichier (tests) : pool par défaut → une connexion par thread,
        # ce qui évite le partage d'une seule connexion entre threads détachés (R15).
    return kwargs


_scheme = urlparse(settings.DATABASE_URL).scheme
_is_sqlite = _scheme.startswith("sqlite")
_is_sqlite_memory = _is_sqlite and (
    ":memory:" in settings.DATABASE_URL or "mode=memory" in settings.DATABASE_URL
)

engine = create_engine(settings.DATABASE_URL, **build_engine_kwargs(settings.DATABASE_URL))

if _is_sqlite and not _is_sqlite_memory:
    # WAL : lecteurs et écrivain ne se bloquent pas. busy_timeout : un verrou
    # transitoire attend au lieu d'échouer immédiatement (« database is locked »).
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover (tests only)
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=30000")
        cur.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
