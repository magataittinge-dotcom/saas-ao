"""
Pytest config: in-memory SQLite DB + dependency overrides for auth.

Must set env vars BEFORE importing backend modules, because database.py
and config.py are evaluated at import time with the current env.
"""
import os
import sys
from pathlib import Path

_BACKEND = Path(__file__).parent
sys.path.insert(0, str(_BACKEND))

# Force in-memory SQLite + satisfy pydantic-settings required fields.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")
os.environ.setdefault("CLERK_SECRET_KEY", "test-clerk-secret")
os.environ.setdefault("CLERK_JWKS_URL", "https://example.clerk.accounts.dev/.well-known/jwks.json")
os.environ.setdefault("DEBUG", "true")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

# Importing main triggers Base.metadata.create_all against the test SQLite engine.
import models  # noqa: E402,F401 — ensure all model classes register with Base
from database import Base, SessionLocal, engine, get_db  # noqa: E402
from main import app  # noqa: E402
from models.organization import Organization  # noqa: E402
from models.user import User  # noqa: E402
from routers.auth import get_auth_user  # noqa: E402


@pytest.fixture(autouse=True)
def _ai_preflight_no_network(monkeypatch):
    """La garde pré-vol IA ne fait JAMAIS de vrai appel réseau en test :
    ping no-op + cache remis à zéro (les tests qui simulent une panne
    re-patchent _ping pour lever)."""
    from services.ai import api_preflight
    monkeypatch.setattr(api_preflight, "_ping", lambda: None)
    api_preflight._cache.update(ts=0.0, ok=False)


@pytest.fixture(autouse=True)
def _reset_schema():
    """Rebuild a clean schema before each test — avoids cross-test bleed."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    # Durcissement anti-flakiness : les endpoints d'upload lancent des threads
    # démons ("synorix-*") qui écrivent en base ; sans join, ils survivent au
    # test et percutent le drop_all du test suivant.
    import threading
    for t in threading.enumerate():
        if t.name.startswith("synorix-") and t.is_alive():
            t.join(timeout=15)


@pytest.fixture
def db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def test_org(db_session):
    org = Organization(id="org-test-1", name="Synorix Test BTP")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def test_user(db_session, test_org):
    user = User(
        id="user-test-1",
        email="test@synorix.fr",
        name="Test User",
        organization_id=test_org.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def client(test_user):
    """FastAPI TestClient with DB + auth dependencies overridden."""

    def _override_get_db():
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    def _override_get_auth_user():
        return test_user

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_auth_user] = _override_get_auth_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
