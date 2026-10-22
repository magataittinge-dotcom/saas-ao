"""1.2 — L'essai gratuit tient sa promesse : un compte gratuit lance 1 analyse
et génère 1 mémoire ; la 2e tentative reçoit le refus du serveur (402) avec
l'invitation à choisir une offre. Le quota est appliqué par le serveur seul
(l'écran ne bloque plus le plan gratuit)."""
import threading

import pytest

from models.memoire import MemoireTechnique
from models.project import Project, ProjectDocument
from models.quota_consumption import QuotaConsumption

REQ = {"exigence": "Fournir un Kbis", "source_document": "RC", "source_page": 1,
       "source_excerpt": "extrait", "category": "candidature", "priority": "obligatoire"}
CONTENU = {"preambule": "Préambule.", "partie_a": {"implantation": "Reims."},
           "partie_b": {}, "partie_c": {}}


@pytest.fixture(autouse=True)
def no_rate_limit(monkeypatch):
    import routers.memoire as memoire_mod
    from main import app
    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)
    monkeypatch.setattr(app.state.limiter, "enabled", False, raising=False)


@pytest.fixture
def ia_simulee(monkeypatch):
    """Aucun appel à Claude : analyse et génération simulées."""
    import routers.memoire as memoire_mod
    from services.ai import checklist_matcher, dce_analyzer

    def _analyse(self, *a, **kw):
        return {"requirements": [dict(REQ)], "criteres_jugement": [], "infos_marche": {}}

    async def _aucun_rapprochement(self, *a, **kw):
        return []

    async def _generation(self, **kwargs):
        return dict(CONTENU)

    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _analyse)
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _aucun_rapprochement)
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _generation)


def _attendre(prefixe: str):
    for t in threading.enumerate():
        if t.name.startswith(prefixe):
            t.join(timeout=30)


def _projet(db, org_id: str, pid: str):
    db.add(Project(id=pid, organization_id=org_id, name=f"AO {pid}"))
    db.add(ProjectDocument(project_id=pid, type="rc", file_url="x", file_name="rc.pdf",
                           extracted_text="Règlement de consultation. Article 1 : candidature. " * 50))
    db.add(ProjectDocument(project_id=pid, type="cctp", file_url="x", file_name="cctp.pdf",
                           extracted_text="CCTP prescriptions techniques. " * 50))
    db.commit()


def _consommes(db, org_id: str, kind: str) -> int:
    return db.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == org_id, QuotaConsumption.kind == kind).count()


def test_compte_gratuit_une_analyse_et_un_memoire_puis_refus_du_serveur(client, db_session, test_org, ia_simulee):
    assert test_org.plan == "free"
    _projet(db_session, test_org.id, "proj-essai-1")

    # 1re analyse : acceptée par le serveur
    r = client.post("/api/projects/proj-essai-1/analyze")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "started"
    _attendre("synorix-analysis-")

    # 1er mémoire : accepté et enregistré
    r = client.post("/api/projects/proj-essai-1/memoire/generate", json={})
    assert r.status_code == 200, r.text
    _attendre("synorix-memoire-")
    db_session.expire_all()
    assert db_session.query(MemoireTechnique).filter(
        MemoireTechnique.project_id == "proj-essai-1").first() is not None
    assert _consommes(db_session, test_org.id, "analysis") == 1
    assert _consommes(db_session, test_org.id, "memoire") == 1

    # 2e analyse : refus du serveur, avec l'invitation à choisir une offre
    _projet(db_session, test_org.id, "proj-essai-2")
    r = client.post("/api/projects/proj-essai-2/analyze")
    assert r.status_code == 402
    detail = r.json()["detail"]
    assert "essai" in detail
    assert "Essentiel" in detail and "Pro" in detail and "Business" in detail

    # 2e mémoire : même refus
    r = client.post("/api/projects/proj-essai-1/memoire/generate", json={})
    assert r.status_code == 402
    assert "Choisissez une offre" in r.json()["detail"]
    assert _consommes(db_session, test_org.id, "analysis") == 1
    assert _consommes(db_session, test_org.id, "memoire") == 1
