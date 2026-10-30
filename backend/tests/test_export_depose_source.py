"""
/export/detail expose « Déposé le … par … » et la source de la signature lue dans le RC
(bloc 9, migrations 0026 et 0027), comme GET /checklist. Isolation multi-tenant : la
ligne d'un autre organisme n'est jamais atteignable. Données inventées.
"""
from datetime import datetime

from models.checklist_item import ChecklistItem
from models.organization import Organization
from models.project import Project
from models.user import User

PID = "proj-exp-dep"


def _ligne(client, pid, id_):
    r = client.get(f"/api/projects/{pid}/export/detail")
    assert r.status_code == 200, r.text
    return {l["id"]: l for l in r.json()["checklist_items"]}[id_]


def test_le_depot_et_la_source_de_la_signature_sont_exposes(client, db_session, test_org, test_user):
    db_session.add(Project(id=PID, organization_id=test_org.id, name="AO export"))
    db_session.add(ChecklistItem(
        id="l-dc1", project_id=PID, document_type_required="dc1_template", source_kind="dce_template",
        document_group="completer", status="present",
        depose_le=datetime(2026, 11, 12, 9, 30), depose_par_id=test_user.id,
        source_document="RC.pdf", source_page=7, source_article="Article 5.2 — Présentation des candidatures",
        source_exigence_id=None,
    ))
    db_session.add(ChecklistItem(
        id="l-rien", project_id=PID, document_type_required="urssaf", source_kind="vault",
        document_group="fournir", status="manquant",
    ))
    db_session.commit()

    l = _ligne(client, PID, "l-dc1")
    assert l["depose_par"] == test_user.name
    assert l["depose_le"] == "2026-11-12T09:30:00Z"      # UTC explicite
    assert (l["source_document"], l["source_page"]) == ("RC.pdf", 7)
    assert l["source_article"].startswith("Article 5.2")

    vide = _ligne(client, PID, "l-rien")
    assert vide["depose_le"] is None and vide["depose_par"] is None
    assert vide["source_document"] is None and vide["source_article"] is None


def test_une_autre_organisation_ne_voit_ni_le_depot_ni_l_auteur(client, db_session, test_org):
    db_session.add(Organization(id="org-autre-exp", name="Autre"))
    db_session.add(User(id="u-autre-exp", email="autre-exp@example.test", name="Auteur SECRET_AUTRE_ORG",
                        organization_id="org-autre-exp"))
    db_session.add(Project(id="proj-autre-exp", organization_id="org-autre-exp", name="AO autre"))
    db_session.add(ChecklistItem(
        id="l-autre-exp", project_id="proj-autre-exp", document_type_required="dc1_template",
        source_kind="dce_template", document_group="completer", status="present",
        depose_le=datetime(2026, 11, 12, 9, 30), depose_par_id="u-autre-exp",
        source_document="RC_SECRET.pdf", source_page=3, source_article="Article SECRET",
    ))
    db_session.commit()

    r = client.get("/api/projects/proj-autre-exp/export/detail")
    assert r.status_code == 404
    assert "SECRET" not in r.text
