"""
Audit #6 — l'écran Analyse affiche les exigences dans l'ORDRE DE LECTURE
du DCE (RC d'abord, puis CCAP/AE/CCTP/DPGF, page croissante), pas dans
l'ordre de sortie de l'IA (created_at).
"""
from models.compliance_item import ComplianceItem
from models.project import Project


def _add(db, pid, text, doc, page):
    db.add(ComplianceItem(
        project_id=pid, exigence_text=text, source_document=doc,
        source_page=page, category="candidature", priority="obligatoire",
    ))


def test_compliance_returned_in_dce_reading_order(client, db_session, test_org):
    db_session.add(Project(id="proj-order1", organization_id=test_org.id, name="X"))
    # Insérées dans le DÉSORDRE : l'ordre de création est l'ordre de l'IA.
    _add(db_session, "proj-order1", "CCTP p2", "CCTP Lot 01.pdf", 2)
    _add(db_session, "proj-order1", "RC p5", "Règlement de consultation.pdf", 5)
    _add(db_session, "proj-order1", "CCAP p3", "CCAP.pdf", 3)
    _add(db_session, "proj-order1", "RC p1", "RC.pdf", 1)
    db_session.commit()

    resp = client.get("/api/projects/proj-order1/compliance")
    assert resp.status_code == 200
    texts = [i["exigence_text"] for i in resp.json()]
    assert texts == ["RC p1", "RC p5", "CCAP p3", "CCTP p2"]


def test_compliance_order_no_page_goes_last_within_doc(client, db_session, test_org):
    db_session.add(Project(id="proj-order2", organization_id=test_org.id, name="X"))
    _add(db_session, "proj-order2", "RC sans page", "RC.pdf", None)
    _add(db_session, "proj-order2", "RC p2", "RC.pdf", 2)
    db_session.commit()

    resp = client.get("/api/projects/proj-order2/compliance")
    texts = [i["exigence_text"] for i in resp.json()]
    assert texts == ["RC p2", "RC sans page"]


def test_doc_rank_never_confuses_substrings():
    """« rc » est un piège de sous-chaîne (« maRChé ») — le rang est robuste."""
    from routers.compliance import _doc_rank

    assert _doc_rank("RC.pdf") == 0
    assert _doc_rank("Règlement de consultation.pdf") == 0
    assert _doc_rank("CCAP.pdf") == 1
    assert _doc_rank("Acte d'engagement.pdf") == 2
    assert _doc_rank("CCTP lot 3.pdf") == 3
    assert _doc_rank("DPGF lot 3.xlsx") == 4
    # Pas de faux positif RC sur « marché » ni AE sur « chaussée ».
    assert _doc_rank("Pièces marché.pdf") == 5
    assert _doc_rank("Plan de chaussée.pdf") == 5
