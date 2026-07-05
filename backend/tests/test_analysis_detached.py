"""
Analyse DÉTACHÉE (fix perte d'état) — le run survit à la navigation, au
rechargement et à la coupure HTTP ; échec → statut erreur explicite +
relance ; exigences de la passe 1 persistées au fil de l'eau.
"""
import asyncio
import threading
from datetime import date

import pytest

from models.compliance_item import ComplianceItem
from models.project import Project, ProjectDocument


def _join_analysis_threads():
    for t in threading.enumerate():
        if t.name.startswith("synorix-analysis-"):
            t.join(timeout=30)


def _make_project(db, org_id, pid):
    from models.organization import Organization
    db.get(Organization, org_id).plan = "pro"  # plusieurs runs dans le test
    db.add(Project(id=pid, organization_id=org_id, name="X", deadline=date.today()))
    db.add(ProjectDocument(
        project_id=pid, type="rc", file_url="x", file_name="rc.pdf",
        extracted_text="Règlement de consultation. Article 1: candidature. " * 50,
    ))
    db.add(ProjectDocument(
        project_id=pid, type="cctp", file_url="x", file_name="cctp.pdf",
        extracted_text="CCTP prescriptions techniques. " * 50,
    ))
    db.commit()


REQ = {"exigence": "Fournir un Kbis", "source_document": "RC", "source_page": 1,
       "source_excerpt": "extrait", "category": "candidature", "priority": "obligatoire"}


def test_failure_sets_error_and_allows_relaunch(client, db_session, test_org, monkeypatch):
    """Échec Claude → statut error + message ; relance possible ; l'étape ne
    régresse JAMAIS (l'utilisateur retrouve son écran d'analyse)."""
    from services.ai import dce_analyzer

    _make_project(db_session, test_org.id, "proj-det1")

    def _boom(self, *a, **kw):
        raise RuntimeError("Claude est tombé")
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _boom)

    assert client.post("/api/projects/proj-det1/analyze").json()["status"] == "started"
    _join_analysis_threads()

    db_session.expire_all()
    p = db_session.get(Project, "proj-det1")
    assert p.processing_status == "error"
    assert "relancez" in (p.processing_detail or "").lower()
    assert p.current_step == 3

    # Relance : le thread précédent est mort → nouveau run accepté
    def _ok(self, *a, **kw):
        return {"requirements": [dict(REQ)], "criteres_jugement": [], "infos_marche": {}}
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _ok)
    from services.ai import checklist_matcher
    async def _nomatch(self, *a, **kw):
        return []
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _nomatch)

    assert client.post("/api/projects/proj-det1/analyze").json()["status"] == "started"
    _join_analysis_threads()
    db_session.expire_all()
    p = db_session.get(Project, "proj-det1")
    assert p.processing_status == "ready"
    assert p.status == "analyzed"


def test_pass1_requirements_persisted_midstream(client, db_session, test_org, monkeypatch):
    """Un crash en passe 2 ne perd PAS les exigences de la passe 1."""
    from services.ai import dce_analyzer

    _make_project(db_session, test_org.id, "proj-det2")

    def _pass1_then_crash(self, pass_text, system_prompt, label, *a, **kw):
        if "passe1" in label:
            return {"requirements": [dict(REQ)], "criteres_jugement": [], "infos_marche": {}}
        raise RuntimeError("crash en passe 2")
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _pass1_then_crash)

    client.post("/api/projects/proj-det2/analyze")
    _join_analysis_threads()

    db_session.expire_all()
    items = db_session.query(ComplianceItem).filter(
        ComplianceItem.project_id == "proj-det2").all()
    assert len(items) == 1                       # la passe 1 a survécu
    assert items[0].exigence_text == "Fournir un Kbis"
    p = db_session.get(Project, "proj-det2")
    # le tronc commun est sauvé ; l'échec du lot est REMONTÉ dans le detail
    assert p.processing_status in ("error", "ready")
    if p.processing_status == "ready":
        assert "échec" in (p.processing_detail or "")


def test_double_run_rejected_409(client, db_session, test_org, monkeypatch):
    from services.ai import dce_analyzer

    _make_project(db_session, test_org.id, "proj-det3")
    release = threading.Event()

    async def _slow(self, **kw):
        await asyncio.to_thread(release.wait, 20)
        return {"requirements": [dict(REQ)], "criteres_jugement": [], "infos_marche": {}}
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "extract_full_analysis_multi_pass", _slow)
    from services.ai import checklist_matcher
    async def _nomatch(self, *a, **kw):
        return []
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _nomatch)

    assert client.post("/api/projects/proj-det3/analyze").json()["status"] == "started"
    resp2 = client.post("/api/projects/proj-det3/analyze")
    release.set()
    assert resp2.status_code == 409
    _join_analysis_threads()
