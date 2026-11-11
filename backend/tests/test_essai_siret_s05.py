"""S-05 (audit de sécurité, P1) — « un SIRET vérifié avant de consommer l'AO offert », derrière ESSAI_EXIGE_SIRET.

Éteinte (défaut) : comportement d'aujourd'hui, l'offre gratuite sans SIRET lance son analyse. Allumée : 402 avec un
message clair et aucun appel au modèle ; avec un SIRET vérifié, l'analyse part. Modèle simulé."""
import threading
from datetime import date

import pytest

from models.organization import Organization
from models.project import Project, ProjectDocument
from services import quota


def _attendre():
    for t in threading.enumerate():
        if t.name.startswith(("synorix-analysis-", "synorix-memoire-")):
            t.join(timeout=30)


@pytest.fixture
def essai(db_session, test_org, monkeypatch):
    from services.ai import checklist_matcher, dce_analyzer
    appels = []

    def passe(self, *a, **k):
        appels.append(1)
        return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}

    async def _rien(self, *a, **k):
        return []
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", passe)
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_demo_mode", False, raising=False)
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _rien)
    org = db_session.get(Organization, test_org.id)
    org.plan, org.siret_verified = "free", False
    db_session.add(Project(id="p-essai", organization_id=test_org.id, name="X", deadline=date.today(),
                           selected_lot="lot1", current_step=5, lots_detectes=[{"id": "lot1", "nom": "Lot 01"}]))
    db_session.add(ProjectDocument(project_id="p-essai", type="rc", file_url="x", file_name="rc.pdf",
                                   extracted_text="Règlement inventé pour le test. " * 40))
    db_session.commit()
    return appels


def test_eteinte_par_defaut_l_essai_part_sans_siret(client, essai, monkeypatch):
    monkeypatch.delenv("ESSAI_EXIGE_SIRET", raising=False)
    r = client.post("/api/projects/p-essai/analyze")
    _attendre()
    assert r.status_code in (200, 202) and essai


def test_allumee_sans_siret_verifie_402_sans_appel(client, essai, monkeypatch):
    monkeypatch.setenv("ESSAI_EXIGE_SIRET", "1")
    r = client.post("/api/projects/p-essai/analyze")
    assert r.status_code == 402 and r.json()["detail"] == quota.MSG_ESSAI_SIRET
    r = client.post("/api/projects/p-essai/memoire/generate", json={})
    assert r.status_code == 402 and r.json()["detail"] == quota.MSG_ESSAI_SIRET
    _attendre()
    assert essai == []
    for mot in ("manquant", "incomplet", "absent", "!"):
        assert mot not in quota.MSG_ESSAI_SIRET.lower()


def test_allumee_avec_siret_verifie_l_essai_part(client, essai, db_session, test_org, monkeypatch):
    monkeypatch.setenv("ESSAI_EXIGE_SIRET", "1")
    db_session.get(Organization, test_org.id).siret_verified = True
    db_session.commit()
    r = client.post("/api/projects/p-essai/analyze")
    _attendre()
    assert r.status_code in (200, 202) and essai


def test_allumee_une_offre_payante_n_est_pas_concernee(client, essai, db_session, test_org, monkeypatch):
    monkeypatch.setenv("ESSAI_EXIGE_SIRET", "1")
    db_session.get(Organization, test_org.id).plan = "pro"
    db_session.commit()
    r = client.post("/api/projects/p-essai/analyze")
    _attendre()
    assert r.status_code in (200, 202)
