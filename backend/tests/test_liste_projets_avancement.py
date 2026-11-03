"""Mes AO — champ `avancement` de GET /projects (nuit du 3 au 4/11, point 2).

Unités consommées, pièces du coffre-fort prêtes, plan validé, mémoire écrit : calculés par AO en UNE requête groupée par table
(pas de N+1), filtrés par organisation. Une donnée qui n'existe pas vaut null.
"""
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from database import SessionLocal, engine, get_db
from main import app
from models.checklist_item import ChecklistItem
from models.memoire import MemoireTechnique
from models.organization import Organization
from models.plan_memoire import PlanMemoire
from models.project import Project
from models.quota_consumption import QuotaConsumption
from models.user import User
from routers.auth import get_auth_user


@pytest.fixture
def deux_orgs(db_session):
    db_session.add_all([Organization(id="org-A", name="A — Façade Pro"), Organization(id="org-B", name="B — Maçonnerie")])
    db_session.commit()
    a = User(id="user-A", email="a@a.fr", name="Alice", organization_id="org-A")
    b = User(id="user-B", email="b@b.fr", name="Bob", organization_id="org-B")
    db_session.add_all([a, b])
    db_session.commit()
    return a, b


def _client(user):
    def _db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_auth_user] = lambda: user
    return TestClient(app)


def _peupler(db, org: str, prefixe: str, nb_projets: int):
    for i in range(nb_projets):
        pid = f"{prefixe}-{i}"
        db.add(Project(id=pid, organization_id=org, name=f"AO {pid}"))
        db.flush()
        db.add(QuotaConsumption(organization_id=org, kind="analysis", project_id=pid, lot="1"))
        if i % 2 == 0:
            db.add(QuotaConsumption(organization_id=org, kind="memoire", project_id=pid, lot="1"))
        db.add(ChecklistItem(project_id=pid, document_type_required="Kbis", status="present"))
        db.add(ChecklistItem(project_id=pid, document_type_required="URSSAF", status="manquant"))
        db.add(ChecklistItem(project_id=pid, document_type_required="Si concerné", status="non_applicable"))
        if i == 0:
            db.add(PlanMemoire(project_id=pid, organization_id=org, lot="1", parties=[], valide_le=datetime(2026, 11, 2, 9, 0)))
            db.add(MemoireTechnique(project_id=pid, content_json={}))
    db.commit()


def test_avancement_par_ao_et_aucun_chiffre_de_l_autre_organisation(db_session, deux_orgs):
    a, b = deux_orgs
    _peupler(db_session, "org-A", "pa", 3)
    # L'organisation B consomme beaucoup, sur d'autres projets ET sur un identifiant de projet de A (cas piégé).
    _peupler(db_session, "org-B", "pb", 2)
    for _ in range(5):
        db_session.add(QuotaConsumption(organization_id="org-B", kind="analysis", project_id="pa-0", lot="1"))
    db_session.add(ChecklistItem(project_id="pb-0", document_type_required="X", status="present"))
    db_session.commit()
    try:
        lignes_a = {p["id"]: p for p in _client(a).get("/api/projects").json()}
        lignes_b = {p["id"]: p for p in _client(b).get("/api/projects").json()}
    finally:
        app.dependency_overrides.clear()

    assert set(lignes_a) == {"pa-0", "pa-1", "pa-2"} and set(lignes_b) == {"pb-0", "pb-1"}
    av0 = lignes_a["pa-0"]["avancement"]
    assert av0["unites"] == {"analyses": 1, "memoires": 1}  # les 5 unités de B sur « pa-0 » ne comptent pas
    assert av0["pieces"] == {"total": 2, "pretes": 1}  # « non applicable » exclue
    assert av0["plan_valide_le"].startswith("2026-11-02")
    assert av0["memoire_ecrit_le"] is not None
    av1 = lignes_a["pa-1"]["avancement"]
    assert av1["unites"] == {"analyses": 1, "memoires": 0}
    assert av1["plan_valide_le"] is None and av1["memoire_ecrit_le"] is None
    assert lignes_b["pb-0"]["avancement"]["unites"] == {"analyses": 1, "memoires": 1}
    assert lignes_b["pb-0"]["avancement"]["pieces"]["total"] == 3


def test_sans_aucune_piece_les_pieces_valent_null(db_session, deux_orgs):
    a, _ = deux_orgs
    db_session.add(Project(id="vide", organization_id="org-A", name="AO sans checklist"))
    db_session.commit()
    try:
        ligne = _client(a).get("/api/projects").json()[0]
    finally:
        app.dependency_overrides.clear()
    assert ligne["avancement"]["pieces"] is None
    assert ligne["avancement"]["unites"] == {"analyses": 0, "memoires": 0}


def test_une_seule_requete_par_table_quel_que_soit_le_nombre_d_ao(db_session, deux_orgs):
    a, _ = deux_orgs

    def compter(nb: int) -> int:
        for p in db_session.query(Project).filter(Project.organization_id == "org-A").all():
            db_session.delete(p)
        db_session.commit()
        _peupler(db_session, "org-A", f"n{nb}", nb)
        requetes: list[str] = []

        def ecouter(conn, cursor, statement, parameters, context, executemany):
            requetes.append(statement)

        event.listen(engine, "before_cursor_execute", ecouter)
        try:
            reponse = _client(a).get("/api/projects")
        finally:
            event.remove(engine, "before_cursor_execute", ecouter)
            app.dependency_overrides.clear()
        assert reponse.status_code == 200 and len(reponse.json()) == nb
        return len(requetes)

    assert compter(3) == compter(12), "le nombre de requêtes ne doit pas dépendre du nombre d'AO (N+1)"
