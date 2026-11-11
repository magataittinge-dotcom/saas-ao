"""S-04 (audit de sécurité, P1) — plafond journalier de lancements d'analyse et de mémoire, pour toutes les offres.

- PLAFOND_JOUR_ANALYSES / PLAFOND_JOUR_MEMOIRES (20 par défaut, 0 = pas de plafond) ; le 21e lancement du jour → 429
  « Plafond du jour atteint, il se remet à zéro demain. », même en Business (illimité au mois) ;
- une analyse en échec puis remboursée compte dans le plafond du jour (l'unité du mois, elle, est rendue) ;
- des générations de mémoire lancées en même temps sur plusieurs AO ne passent plus toutes le contrôle du quota.
Modèles simulés : aucun appel réel."""
import threading
from datetime import date

import pytest

from models.audit_log import AuditLog
from models.organization import Organization
from models.project import Project, ProjectDocument
from models.quota_consumption import QuotaConsumption

MSG = "Plafond du jour atteint, il se remet à zéro demain."


def _projet(db, org_id, pid):
    db.add(Project(id=pid, organization_id=org_id, name="X", deadline=date.today(), selected_lot="lot1",
                   selected_lot_name="Lot 1", current_step=5, lots_detectes=[{"id": "lot1", "nom": "Lot 01"}]))
    db.add(ProjectDocument(project_id=pid, type="rc", file_url="x", file_name="rc.pdf",
                           extracted_text="Règlement inventé pour le test. " * 40))


def _attendre(prefixe):
    for t in threading.enumerate():
        if t.name.startswith(prefixe):
            t.join(timeout=30)


@pytest.fixture
def analyse_simulee(monkeypatch):
    from services.ai import checklist_matcher, dce_analyzer
    etat = {"n": 0, "panne": False}

    def passe(self, *a, **k):
        etat["n"] += 1
        if etat["panne"]:
            raise RuntimeError("panne simulée après l'appel")
        return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}

    async def _rien(self, *a, **k):
        return []
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", passe)
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_demo_mode", False, raising=False)
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _rien)
    return etat


def _offre(db, org_id, plan):
    db.get(Organization, org_id).plan = plan
    db.commit()


def test_le_21e_lancement_d_analyse_business_est_refuse(client, db_session, test_org, analyse_simulee):
    _offre(db_session, test_org.id, "business")
    _projet(db_session, test_org.id, "p-j")
    db_session.commit()
    codes = []
    for _ in range(21):
        codes.append(client.post("/api/projects/p-j/analyze").status_code)
        _attendre("synorix-analysis-")
    assert codes[:20] == [202] * 20 or set(codes[:20]) <= {200, 202}, codes
    assert codes[20] == 429
    assert analyse_simulee["n"] == 20
    r = client.post("/api/projects/p-j/analyze")
    assert r.status_code == 429 and r.json()["detail"] == MSG


def test_une_analyse_remboursee_compte_dans_le_jour(client, db_session, test_org, analyse_simulee, monkeypatch):
    monkeypatch.setenv("PLAFOND_JOUR_ANALYSES", "2")
    _offre(db_session, test_org.id, "pro")
    _projet(db_session, test_org.id, "p-r")
    db_session.commit()
    analyse_simulee["panne"] = True
    for _ in range(2):
        client.post("/api/projects/p-r/analyze")
        _attendre("synorix-analysis-")
    db_session.expire_all()
    assert db_session.query(QuotaConsumption).filter(QuotaConsumption.kind == "analysis").count() == 0  # remboursées
    assert client.post("/api/projects/p-r/analyze").status_code == 429
    assert db_session.query(AuditLog).filter(AuditLog.action == "jour.analyse").count() == 2


def test_plafond_a_zero_et_plafond_memoire(client, db_session, test_org, monkeypatch):
    import routers.memoire as mm
    monkeypatch.setattr(mm, "_run_memoire_job_corps", lambda *a, **k: None)
    _offre(db_session, test_org.id, "business")
    for i in range(4):
        _projet(db_session, test_org.id, f"p-mj{i}")
    db_session.commit()
    monkeypatch.setenv("PLAFOND_JOUR_MEMOIRES", "2")
    codes = []
    for i in range(3):
        codes.append(client.post(f"/api/projects/p-mj{i}/memoire/generate", json={}).status_code)
        _attendre("synorix-memoire-")
    assert codes == [200, 200, 429]
    monkeypatch.setenv("PLAFOND_JOUR_MEMOIRES", "0")
    assert client.post("/api/projects/p-mj3/memoire/generate", json={}).status_code == 200
    _attendre("synorix-memoire-")


def test_memoires_simultanes_sur_plusieurs_ao_une_seule_unite_restante(client, db_session, test_org, monkeypatch):
    """Pro à 39/40 : trois générations lancées pendant que la première tourne → une seule passe le contrôle."""
    import routers.memoire as mm
    feu = threading.Event()
    lancees = []

    def corps(project_id, *a, **k):
        lancees.append(project_id)
        feu.wait(20)
    monkeypatch.setattr(mm, "_run_memoire_job_corps", corps)
    _offre(db_session, test_org.id, "pro")
    for i in range(39):
        db_session.add(QuotaConsumption(organization_id=test_org.id, kind="memoire", project_id="ancien"))
    for pid in ("p-c1", "p-c2", "p-c3"):
        _projet(db_session, test_org.id, pid)
    db_session.commit()
    try:
        codes = [client.post(f"/api/projects/{pid}/memoire/generate", json={}).status_code
                 for pid in ("p-c1", "p-c2", "p-c3")]
        assert codes == [200, 402, 402], codes
    finally:
        feu.set()
        _attendre("synorix-memoire-")
    assert lancees == ["p-c1"]
    db_session.expire_all()
    assert db_session.get(Project, "p-c2").processing_status != "generating"


def test_service_indisponible_rend_le_creneau(client, db_session, test_org, monkeypatch):
    from services.ai import api_preflight

    def panne():
        raise api_preflight.AIServiceUnavailable("indisponible")
    monkeypatch.setattr(api_preflight, "ensure_ai_service_available", panne)
    _offre(db_session, test_org.id, "pro")
    _projet(db_session, test_org.id, "p-503")
    db_session.commit()
    assert client.post("/api/projects/p-503/memoire/generate", json={}).status_code == 503
    db_session.expire_all()
    assert db_session.get(Project, "p-503").processing_status != "generating"
