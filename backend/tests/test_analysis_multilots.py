"""
Multi-lots mutualisé (échelle « démo Sionneau »).

  • Le TRONC COMMUN (RC/CCAP/AE → pass1) est analysé UNE fois et partagé
    entre lots ('_commun') ; seul le spécifique (CCTP/DPGF du lot → pass2)
    est analysé par lot.
  • Un run sur d'autres lots RÉUTILISE le tronc commun (0 appel pass1) et
    ne touche PAS aux exigences des lots déjà analysés (fini l'écrasement).
  • 1 POST = N lots (une action utilisateur) ; quota = 1 unité PAR lot.
"""
import threading
from datetime import date

import pytest

from models.compliance_item import ComplianceItem
from models.project import Project, ProjectDocument
from models.quota_consumption import QuotaConsumption


def _join():
    for t in threading.enumerate():
        if t.name.startswith("synorix-analysis-"):
            t.join(timeout=30)


def _mk(db, org_id, pid):
    from models.organization import Organization
    db.get(Organization, org_id).plan = "pro"
    p = Project(id=pid, organization_id=org_id, name="X", deadline=date.today(),
                lots_detectes=[
                    {"id": "lot1", "nom": "Lot 01 — GO"},
                    {"id": "lot2", "nom": "Lot 02 — Étanchéité"},
                    {"id": "lot3", "nom": "Lot 03 — PVC"},
                ])
    db.add(p)
    db.add(ProjectDocument(project_id=pid, type="rc", file_url="x", file_name="rc.pdf",
                           extracted_text="Règlement. Candidature obligatoire. " * 40))
    db.add(ProjectDocument(project_id=pid, type="cctp", file_url="x", file_name="cctp lot 01.pdf",
                           extracted_text="CCTP lot 1. Prescriptions GO. " * 40,
                           related_lots=["1"]))
    db.add(ProjectDocument(project_id=pid, type="cctp", file_url="x", file_name="cctp lot 02.pdf",
                           extracted_text="CCTP lot 2. Étanchéité. " * 40,
                           related_lots=["2"]))
    db.commit()
    return p


PASS_CALLS = []


def _fake_run_pass(self, pass_text, system_prompt, label, *a, **kw):
    PASS_CALLS.append(label)
    if "passe1" in label:
        return {"requirements": [
            {"exigence": "Fournir DC1", "source_document": "RC", "source_page": 1,
             "source_excerpt": "Candidature obligatoire.", "category": "candidature",
             "priority": "obligatoire"}],
            "criteres_jugement": [], "infos_marche": {}}
    return {"requirements": [
        {"exigence": f"Technique {label}", "source_document": "CCTP", "source_page": 1,
         "source_excerpt": "Prescriptions GO.", "category": "technique",
         "priority": "obligatoire"}],
        "criteres_jugement": [], "infos_marche": {}}


@pytest.fixture(autouse=True)
def _mocks(monkeypatch):
    PASS_CALLS.clear()
    from services.ai import dce_analyzer, checklist_matcher
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _fake_run_pass)
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_demo_mode", False, raising=False)

    async def _nomatch(self, *a, **kw):
        return []
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _nomatch)


def test_multilots_one_pass1_shared(client, db_session, test_org):
    _mk(db_session, test_org.id, "proj-ml1")

    resp = client.post("/api/projects/proj-ml1/analyze", json={"lots": ["lot1", "lot2"]})
    assert resp.status_code == 200, resp.text
    _join()

    pass1_calls = [c for c in PASS_CALLS if "passe1" in c]
    pass2_calls = [c for c in PASS_CALLS if "passe2" in c]
    assert len(pass1_calls) == 1, PASS_CALLS       # tronc commun UNE fois
    assert len(pass2_calls) == 2                    # un spécifique par lot

    db_session.expire_all()
    items = db_session.query(ComplianceItem).filter(
        ComplianceItem.project_id == "proj-ml1").all()
    lots = sorted(set(i.lot for i in items))
    assert lots == ["_commun", "lot1", "lot2"], lots

    # Quota : 1 unité PAR lot
    used = db_session.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == test_org.id,
        QuotaConsumption.kind == "analysis").count()
    assert used == 2


def test_second_run_reuses_commun_and_keeps_other_lots(client, db_session, test_org):
    _mk(db_session, test_org.id, "proj-ml2")
    client.post("/api/projects/proj-ml2/analyze", json={"lots": ["lot1"]})
    _join()
    PASS_CALLS.clear()

    resp = client.post("/api/projects/proj-ml2/analyze", json={"lots": ["lot2"]})
    assert resp.status_code == 200, resp.text
    _join()

    assert not any("passe1" in c for c in PASS_CALLS), PASS_CALLS  # commun réutilisé
    db_session.expire_all()
    items = db_session.query(ComplianceItem).filter(
        ComplianceItem.project_id == "proj-ml2").all()
    lots = sorted(set(i.lot for i in items))
    assert lots == ["_commun", "lot1", "lot2"]      # lot1 PAS écrasé


def test_compliance_endpoint_filters_by_lot(client, db_session, test_org):
    _mk(db_session, test_org.id, "proj-ml3")
    client.post("/api/projects/proj-ml3/analyze", json={"lots": ["lot1", "lot2"]})
    _join()

    body = client.get("/api/projects/proj-ml3/compliance?lot=lot1").json()
    lots = {i.get("lot") for i in body}
    assert lots == {"_commun", "lot1"}              # commun + lot demandé
