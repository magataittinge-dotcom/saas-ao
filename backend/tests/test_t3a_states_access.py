"""T3a — intégrité d'accès & d'états.

- R11 : un projet SOFT-SUPPRIMÉ est inaccessible partout (analyse, mémoire,
        compliance…) — fini les 5 routers qui l'ignoraient et laissaient
        consommer quota + API sur un projet supprimé.
- R12 : pas de relance (analyse/mémoire) sur un projet CLÔTURÉ (gagné/perdu)
        — la machine à états n'est plus contournée par les écritures directes.
"""
from datetime import date, datetime

from models.project import Project, ProjectDocument


def _project(db, org_id, pid, **kw):
    db.add(Project(id=pid, organization_id=org_id, name="X", deadline=date.today(), **kw))
    db.add(ProjectDocument(project_id=pid, type="rc", file_url="x", file_name="rc.pdf",
                           extracted_text="Règlement de consultation. " * 60))
    db.commit()


# ── R11 : projet soft-supprimé inaccessible ───────────────────────────────
def test_soft_deleted_project_blocks_analysis(client, db_session, test_org):
    db_session.get(type(test_org), test_org.id).plan = "pro"
    _project(db_session, test_org.id, "p-del1", deleted_at=datetime.utcnow())
    assert client.post("/api/projects/p-del1/analyze").status_code == 404


def test_soft_deleted_project_blocks_memoire(client, db_session, test_org):
    _project(db_session, test_org.id, "p-del2", selected_lot="all",
             deleted_at=datetime.utcnow())
    assert client.post("/api/projects/p-del2/memoire/generate", json={}).status_code == 404


def test_soft_deleted_project_blocks_compliance(client, db_session, test_org):
    _project(db_session, test_org.id, "p-del3", deleted_at=datetime.utcnow())
    assert client.get("/api/projects/p-del3/compliance").status_code == 404


# ── R12 : pas de relance sur projet clôturé ───────────────────────────────
def test_analyze_blocked_on_won_project(client, db_session, test_org):
    db_session.get(type(test_org), test_org.id).plan = "pro"
    _project(db_session, test_org.id, "p-won", status="gagné")
    resp = client.post("/api/projects/p-won/analyze")
    assert resp.status_code == 409, resp.text
    # le statut terminal n'a PAS été réécrit en 'en_cours'
    db_session.expire_all()
    assert db_session.get(Project, "p-won").status == "gagné"


def test_memoire_blocked_on_lost_project(client, db_session, test_org):
    _project(db_session, test_org.id, "p-lost", status="perdu", selected_lot="all")
    resp = client.post("/api/projects/p-lost/memoire/generate", json={})
    assert resp.status_code == 409, resp.text
    db_session.expire_all()
    assert db_session.get(Project, "p-lost").status == "perdu"
