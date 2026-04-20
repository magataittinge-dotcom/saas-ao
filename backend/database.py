from urllib.parse import urlparse

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from config import get_settings

settings = get_settings()

_scheme = urlparse(settings.DATABASE_URL).scheme
_engine_kwargs: dict = {"pool_pre_ping": True}
if _scheme.startswith("postgres"):
    _engine_kwargs.update({
        "pool_size": 10,
        "max_overflow": 20,
        "connect_args": {"options": "-c client_encoding=utf8"},
    })
elif _scheme.startswith("sqlite"):
    from sqlalchemy.pool import StaticPool
    _engine_kwargs.update({
        "connect_args": {"check_same_thread": False},
        "poolclass": StaticPool,
    })

engine = create_engine(settings.DATABASE_URL, **_engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
