"""
Tests B7 — statut « Analysé — sans suite » (état de SUCCÈS produit :
l'utilisateur a analysé et décidé de ne pas répondre, en connaissance).
"""
from models.project import Project


def test_patch_sans_suite(client, db_session, test_org):
    p = Project(id="proj-b7", organization_id=test_org.id, name="AO écarté", status="analyzed")
    db_session.add(p)
    db_session.commit()

    resp = client.patch("/api/projects/proj-b7", json={"status": "sans_suite"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "sans_suite"

    db_session.expire_all()
    assert db_session.query(Project).filter(Project.id == "proj-b7").first().status == "sans_suite"


def test_patch_invalid_status_rejected(client, db_session, test_org):
    p = Project(id="proj-b7b", organization_id=test_org.id, name="AO", status="analyzed")
    db_session.add(p)
    db_session.commit()

    resp = client.patch("/api/projects/proj-b7b", json={"status": "nimporte_quoi"})
    assert resp.status_code == 422
    db_session.expire_all()
    assert db_session.query(Project).filter(Project.id == "proj-b7b").first().status == "analyzed"
