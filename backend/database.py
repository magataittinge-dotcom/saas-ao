from urllib.parse import urlparse

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

from config import get_settings

settings = get_settings()

_scheme = urlparse(settings.DATABASE_URL).scheme
_is_sqlite = _scheme.startswith("sqlite")
_is_sqlite_memory = _is_sqlite and (
    ":memory:" in settings.DATABASE_URL or "mode=memory" in settings.DATABASE_URL
)
_engine_kwargs: dict = {"pool_pre_ping": True}
if _scheme.startswith("postgres"):
    _engine_kwargs.update({
        "pool_size": 10,
        "max_overflow": 20,
        "connect_args": {"options": "-c client_encoding=utf8"},
    })
elif _is_sqlite:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
    if _is_sqlite_memory:
        # `:memory:` n'existe qu'au sein d'UNE connexion → StaticPool obligatoire.
        from sqlalchemy.pool import StaticPool
        _engine_kwargs["poolclass"] = StaticPool
    # SQLite sur fichier (tests) : pool par défaut → une connexion par thread,
    # ce qui évite le partage d'une seule connexion entre threads détachés (R15).

engine = create_engine(settings.DATABASE_URL, **_engine_kwargs)

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
