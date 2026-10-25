"""
« Non concerné » sur une pièce (B2 §7 n°8, nuit du 25/10).

Le front n'offrait aucun moyen de dire « non concerné » : une pièce
conditionnelle (DC4 « le cas échéant », habilitation « si groupement »)
bloquait le score et le garde-fou de l'export. Maintenant : POST
/checklist/{id}/non-concerne — persisté (statut non_applicable, déjà dans
l'énumération), exclu du score, réversible (le statut revient aux faits :
pièce liée ou trame déposée), journalisé comme la confirmation, isolé par
organisation.
"""
from datetime import date, timedelta

import pytest

from models.audit_log import AuditLog
from models.checklist_item import ChecklistItem
from models.document import Document
from models.organization import Organization
from models.project import Project, ProjectDocument

PID = "proj-nc"


def _seed(db, org_id, pid=PID):
    db.add(Project(id=pid, organization_id=org_id, name="AO non concerné"))
    db.add(Document(id=f"{pid}-urssaf", organization_id=org_id, type="urssaf", status="valid",
                    expiry_date=date.today() + timedelta(days=90), file_url="/uploads/x/u.pdf",
                    file_name="urssaf.pdf", category="attestations_sociales_fiscales"))
    db.add(ProjectDocument(id=f"{pid}-dc1", project_id=pid, type="dc1_template", is_user_completed=True,
                           file_url="/uploads/x/dc1.pdf", file_name="DC1_rempli.pdf"))
    lignes = [
        ("dc4", "dc4", "dce_template", "completer", None, None, "manquant"),
        ("urssaf", "urssaf", "vault", "fournir", f"{pid}-urssaf", None, "present"),
        ("dc1", "dc1_template", "dce_template", "completer", None, f"{pid}-dc1", "present"),
        ("memoire", "memoire_technique", "vault", "synorix", None, None, "non_applicable"),
    ]
    for id_, type_, kind, groupe, lie, complet, statut in lignes:
        db.add(ChecklistItem(id=f"{pid}-{id_}", project_id=pid, document_type_required=type_,
                             source_kind=kind, document_group=groupe, linked_document_id=lie,
                             completed_project_doc_id=complet, status=statut))
    db.commit()


def _nc(client, pid, id_, valeur=True):
    return client.post(f"/api/projects/{pid}/checklist/{pid}-{id_}/non-concerne", json={"non_concerne": valeur})


def test_non_concerne_persiste_et_sort_du_score(client, db_session, test_org):
    _seed(db_session, test_org.id)
    assert client.get(f"/api/projects/{PID}/checklist/score").json() == {"conformes": 2, "total": 3}

    r = _nc(client, PID, "dc4")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "non_applicable"
    assert client.get(f"/api/projects/{PID}/checklist/score").json() == {"conformes": 2, "total": 2}
    assert db_session.query(AuditLog).filter(AuditLog.action == "checklist.non_concerne").count() == 1


@pytest.mark.parametrize("ligne,statut_rendu", [("urssaf", "present"), ("dc1", "present"), ("dc4", "manquant")])
def test_reversible_le_statut_revient_aux_faits(client, db_session, test_org, ligne, statut_rendu):
    _seed(db_session, test_org.id)
    _nc(client, PID, ligne)
    r = _nc(client, PID, ligne, False)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == statut_rendu
    assert db_session.query(AuditLog).filter(AuditLog.action == "checklist.concerne").count() == 1


def test_le_jalon_synorix_ne_se_reprend_pas(client, db_session, test_org):
    _seed(db_session, test_org.id)
    assert _nc(client, PID, "memoire", False).status_code == 400


def test_corps_valide_et_isolation(client, db_session, test_org):
    _seed(db_session, test_org.id)
    assert client.post(f"/api/projects/{PID}/checklist/{PID}-dc4/non-concerne",
                       json={"non_concerne": "oui", "x": 1}).status_code == 422
    db_session.add(Organization(id="org-autre", name="Autre"))
    db_session.commit()
    _seed(db_session, "org-autre", pid="proj-autre")
    assert _nc(client, "proj-autre", "dc4").status_code == 404
    db_session.expire_all()
    assert db_session.get(ChecklistItem, "proj-autre-dc4").status == "manquant"
