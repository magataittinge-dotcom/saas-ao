"""Décision 2 du 2/11 (R31) — « pas encore de mémoire » n'est pas une erreur : GET /memoire répond 204, pas 404.

Le 404 reste réservé à un projet inconnu ou d'une autre organisation. Données inventées."""
from models.memoire import MemoireTechnique
from models.organization import Organization
from models.project import Project

PID = "p-memoire-204"
CONTENU = {"preambule": "Présentation inventée.", "partie_a": {}, "partie_b": {}, "partie_c": {}}


def _projet(db, org_id, avec_memoire):
    db.add(Project(id=PID, organization_id=org_id, name="AO inventé", status="en_cours"))
    if avec_memoire:
        db.add(MemoireTechnique(project_id=PID, version=1, content_json=CONTENU))
    db.commit()


def test_sans_memoire_204_corps_vide(client, db_session, test_org):
    _projet(db_session, test_org.id, avec_memoire=False)
    r = client.get(f"/api/projects/{PID}/memoire")
    assert r.status_code == 204, r.text
    assert r.content == b""


def test_avec_memoire_200_et_contenu(client, db_session, test_org):
    _projet(db_session, test_org.id, avec_memoire=True)
    r = client.get(f"/api/projects/{PID}/memoire")
    assert r.status_code == 200, r.text
    assert r.json()["content_json"]["preambule"] == "Présentation inventée."


def test_projet_d_une_autre_organisation_reste_404(client, db_session, test_org):
    db_session.add(Organization(id="org-autre-204", name="Autre BTP"))
    db_session.commit()
    _projet(db_session, "org-autre-204", avec_memoire=False)
    assert client.get(f"/api/projects/{PID}/memoire").status_code == 404
    # même avec un mémoire, l'autre organisation ne le lit pas
    db_session.add(MemoireTechnique(project_id=PID, version=1, content_json=CONTENU))
    db_session.commit()
    assert client.get(f"/api/projects/{PID}/memoire").status_code == 404


def test_projet_inconnu_404(client, test_org):
    assert client.get("/api/projects/n-existe-pas/memoire").status_code == 404
