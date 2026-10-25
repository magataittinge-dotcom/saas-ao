"""
« Jointe » aussi à l'écran Vérification (mission V, bloc 2, tranche 6).

L'écran Vérification disait « Conforme » (pièce du coffre) et « Complété »
(formulaire) d'après le seul statut de la ligne. Il reçoit maintenant, comme
l'écran Export, le FAIT vérifié : la pièce part dans le ZIP (et, pour une
pièce du coffre, elle est valable et datée), avec son nom et sa date de
validité — même plan que l'archive.
"""
from datetime import date, timedelta

import pytest

from models.checklist_item import ChecklistItem
from models.document import Document
from models.project import Project, ProjectDocument

TODAY = date.today()
PID = "proj-verif-jointe"


@pytest.fixture
def ws(tmp_path, monkeypatch):
    import routers.export as export_mod
    monkeypatch.setattr(export_mod, "UPLOADS_ROOT", tmp_path)
    return tmp_path


def _fichier(ws, rel):
    p = ws / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"%PDF-1.4 x")
    return f"/uploads/{rel}"


def test_la_verification_recoit_le_fait_jointe(client, db_session, test_org, ws):
    db_session.add(Project(id=PID, organization_id=test_org.id, name="AO Vérification"))
    db_session.add(Document(id="kbis_ok", organization_id=test_org.id, type="kbis", status="valid",
                            expiry_date=TODAY + timedelta(days=50), category="documents_legaux",
                            file_name="kbis.pdf", file_url=_fichier(ws, "organizations/o/kbis.pdf")))
    db_session.add(Document(id="rc_disparue", organization_id=test_org.id, type="rc_civile", status="valid",
                            expiry_date=TODAY + timedelta(days=50), category="assurances",
                            file_name="rc.pdf", file_url="/uploads/organizations/o/disparu.pdf"))
    db_session.add(ProjectDocument(id="dc1-rempli", project_id=PID, type="dc1_template", is_user_completed=True,
                                   file_name="DC1_rempli.pdf", file_url=_fichier(ws, f"projects/{PID}/c/dc1.pdf")))
    for id_, type_, kind, lie, complet in (
        ("l-kbis", "kbis", "vault", "kbis_ok", None),
        ("l-rc", "rc_civile", "vault", "rc_disparue", None),
        ("l-dc1", "dc1_template", "dce_template", None, "dc1-rempli"),
    ):
        db_session.add(ChecklistItem(id=id_, project_id=PID, document_type_required=type_, source_kind=kind,
                                     document_group="fournir" if kind == "vault" else "completer",
                                     linked_document_id=lie, completed_project_doc_id=complet, status="present"))
    db_session.commit()

    lignes = {l["id"]: l for l in client.get(f"/api/projects/{PID}/checklist").json()}
    assert lignes["l-kbis"]["jointe"] is True
    assert lignes["l-kbis"]["piece_nom"] == "kbis.pdf"
    assert lignes["l-kbis"]["valable_jusqu_au"] == (TODAY + timedelta(days=50)).isoformat()
    assert lignes["l-dc1"]["jointe"] is True and lignes["l-dc1"]["piece_nom"] == "DC1_rempli.pdf"
    # statut « present » mais fichier parti du serveur : pas « Jointe »
    assert lignes["l-rc"]["jointe"] is False and lignes["l-rc"]["piece_nom"] is None
