"""
B9 — plus de fausse analyse « démo » (revue backend du 23/10, B9).

Avant : une AuthenticationError de l'API (clé révoquée ou invalide) faisait
renvoyer _DEMO_RESULT comme une vraie analyse — exigence factice persistée,
maître d'ouvrage « Commune Test » recopié, unité de quota consommée.
Maintenant, hors DEBUG : l'analyse échoue proprement (statut erreur, message
clair) et l'unité est rendue ; une clé d'exemple n'active jamais le jeu de
démonstration. En DEBUG (développement local), il reste possible.
Aucun appel réseau : le client Anthropic est remplacé par un client qui
refuse tout (401).
"""
import threading
from datetime import date

import anthropic
import httpx
import pytest

from models.compliance_item import ComplianceItem
from models.project import Project, ProjectDocument
from models.quota_consumption import QuotaConsumption


def _refus():
    return anthropic.AuthenticationError(
        message="invalid x-api-key",
        response=httpx.Response(401, request=httpx.Request("POST", "https://api.anthropic.com/v1/messages")),
        body=None,
    )


class _ClientRefuse:
    """Client Anthropic factice : toute requête est refusée (401)."""

    def __init__(self, *a, **kw):
        self.messages = self

    def stream(self, *a, **kw):
        raise _refus()

    def create(self, *a, **kw):
        raise _refus()


@pytest.fixture
def dce(monkeypatch):
    from services.ai import dce_analyzer
    monkeypatch.setattr(dce_analyzer.anthropic, "Anthropic", _ClientRefuse)
    return dce_analyzer


def _attendre_les_analyses():
    for t in threading.enumerate():
        if t.name.startswith("synorix-analysis-"):
            t.join(timeout=30)


def _projet(db, org_id, pid):
    db.add(Project(id=pid, organization_id=org_id, name="AO B9", deadline=date.today()))
    db.add(ProjectDocument(
        project_id=pid, type="rc", file_url="x", file_name="rc.pdf",
        extracted_text="Règlement de consultation. Article 1 : candidature. " * 50,
    ))
    db.commit()


def test_cle_refusee_hors_debug_echec_propre_et_unite_rendue(client, db_session, test_org, dce, monkeypatch):
    monkeypatch.setattr(dce.settings, "DEBUG", False)
    _projet(db_session, test_org.id, "proj-b9")

    r = client.post("/api/projects/proj-b9/analyze")
    assert r.status_code == 200 and r.json()["status"] == "started", r.text
    _attendre_les_analyses()

    db_session.expire_all()
    p = db_session.get(Project, "proj-b9")
    assert p.processing_status == "error"
    assert "indisponible" in (p.processing_detail or "").lower(), p.processing_detail
    assert p.status != "analyzed"
    assert "Commune Test" not in str(p.infos_marche or {})
    assert db_session.query(ComplianceItem).filter(ComplianceItem.project_id == "proj-b9").count() == 0
    # l'unité décomptée au lancement est rendue
    assert db_session.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == test_org.id).count() == 0


def test_cle_d_exemple_hors_debug_jamais_de_jeu_de_demonstration(dce, monkeypatch):
    monkeypatch.setattr(dce.settings, "DEBUG", False)
    monkeypatch.setattr(dce.settings, "ANTHROPIC_API_KEY", "sk-ant-placeholder")
    analyseur = dce.DCEAnalyzer()
    assert analyseur.is_demo is False
    with pytest.raises(dce.ClaudeAuthenticationError):
        analyseur._sync_call("Texte du RC", "Consigne", "test-b9")
    assert analyseur.is_demo is False


def test_en_debug_le_jeu_de_demonstration_reste_possible(dce, monkeypatch):
    monkeypatch.setattr(dce.settings, "DEBUG", True)
    analyseur = dce.DCEAnalyzer()
    assert analyseur._sync_call("Texte du RC", "Consigne", "test-b9") is dce._DEMO_RESULT
