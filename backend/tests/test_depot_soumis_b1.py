"""B1 (moitié serveur) — « Je l'ai déposé » : la transition vers « soumis ».

Le passage à « soumis » depuis un AO prêt est daté (``depose_at``) et journalisé ; une autre organisation ne peut ni
le déclencher ni deviner que l'AO existe (404, rien n'est écrit, aucune ligne de journal)."""
from datetime import datetime

from fastapi.testclient import TestClient

from database import SessionLocal, get_db
from main import app
from models.audit_log import AuditLog
from models.organization import Organization
from models.project import Project
from models.user import User
from routers.auth import get_auth_user


def _client_as(user):
    def _db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_auth_user] = lambda: user
    return TestClient(app)


def test_le_depot_est_date_et_journalise(client, db_session, test_org):
    db_session.add(Project(id="p-b1a", organization_id=test_org.id, name="AO prêt", status="analyzed"))
    db_session.commit()
    avant = datetime.utcnow()
    r = client.patch("/api/projects/p-b1a", json={"status": "soumis"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "soumis"
    db_session.expire_all()
    p = db_session.get(Project, "p-b1a")
    assert p.depose_at is not None and p.depose_at >= avant.replace(microsecond=0)
    ligne = db_session.query(AuditLog).filter(AuditLog.target_id == "p-b1a").one()
    assert ligne.action == "project.status"


def test_une_autre_organisation_ne_peut_pas_deposer(db_session):
    db_session.add_all([Organization(id="org-b1-a", name="A"), Organization(id="org-b1-b", name="B")])
    db_session.commit()
    db_session.add_all([
        User(id="u-b1-a", email="a@b1.fr", name="A", organization_id="org-b1-a"),
        User(id="u-b1-b", email="b@b1.fr", name="B", organization_id="org-b1-b"),
        Project(id="p-b1b", organization_id="org-b1-a", name="AO de A", status="analyzed"),
    ])
    db_session.commit()
    intrus = db_session.get(User, "u-b1-b")
    try:
        r = _client_as(intrus).patch("/api/projects/p-b1b", json={"status": "soumis"})
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()
    db_session.expire_all()
    p = db_session.get(Project, "p-b1b")
    assert p.status == "analyzed" and p.depose_at is None
    assert db_session.query(AuditLog).filter(AuditLog.target_id == "p-b1b").count() == 0
