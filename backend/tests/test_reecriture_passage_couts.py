"""Restes de sécurité (CORRECTIFS-SECURITE § 7) — la réécriture d'un passage inscrit sa dépense réelle dans couts_ia.

Avant : la route était sous le filet du budget d'IA (forfait réservé pendant la requête) mais sa dépense réelle n'était
jamais inscrite : 60 réécritures par jour ne comptaient pas dans le budget du jour. Le client du SDK est simulé (aucun
appel réel) ; l'appel lui-même (modèle, prompt, paramètres) n'est pas modifié : le test le vérifie.
"""
import types

import pytest

from models.depot_entreprise import CoutIA
from models.memoire import MemoireTechnique
from models.project import Project
from services import couts_ia


@pytest.fixture
def projet(db_session, test_org):
    db_session.add(Project(id="proj-rw", organization_id=test_org.id, name="AO réécriture"))
    db_session.add(MemoireTechnique(project_id="proj-rw", content_json={
        "preambule": "Préambule.", "partie_a": {}, "partie_b": {}, "partie_c": {}}))
    db_session.commit()


class _FauxClient:
    appels: list = []
    echoue = False

    def __init__(self, api_key=None, **_):
        self.messages = self

    def create(self, **kwargs):
        _FauxClient.appels.append(kwargs)
        if _FauxClient.echoue:
            raise RuntimeError("panne simulée")
        usage = types.SimpleNamespace(input_tokens=1200, output_tokens=300,
                                      cache_read_input_tokens=0, cache_creation_input_tokens=0)
        return types.SimpleNamespace(content=[types.SimpleNamespace(text="Passage réécrit.")], usage=usage)


@pytest.fixture
def faux_sdk(monkeypatch):
    import anthropic
    _FauxClient.appels = []
    _FauxClient.echoue = False
    monkeypatch.setattr(anthropic, "Anthropic", _FauxClient)
    return _FauxClient


def _poster(client):
    return client.post("/api/projects/proj-rw/memoire/rewrite-passage",
                       json={"passage": "Le chantier sera propre.", "action": "reformuler"})


def test_la_reecriture_inscrit_sa_depense_reelle(client, db_session, test_org, projet, faux_sdk):
    from services.ai.passage_rewriter import modele_de_reecriture
    reponse = _poster(client)
    assert reponse.status_code == 200, reponse.text
    assert reponse.json()["rewritten"] == "Passage réécrit."
    lignes = db_session.query(CoutIA).filter(CoutIA.organization_id == test_org.id,
                                             CoutIA.usage == "reecriture_passage").all()
    assert len(lignes) == 1
    ligne = lignes[0]
    assert (ligne.jetons_entree, ligne.jetons_sortie) == (1200, 300)
    assert ligne.modele == modele_de_reecriture()
    assert ligne.cout_eur == pytest.approx(couts_ia.calculer(ligne.modele, {"input_tokens": 1200,
                                                                            "output_tokens": 300})[1])
    assert ligne.reference == "proj-rw"
    # L'appel n'a pas changé : un seul appel, au modèle de la génération, jamais de `temperature`.
    assert len(faux_sdk.appels) == 1
    assert faux_sdk.appels[0]["model"] == modele_de_reecriture()
    assert "temperature" not in faux_sdk.appels[0]


def test_un_appel_qui_echoue_n_inscrit_rien_et_reste_un_502(client, db_session, test_org, projet, faux_sdk):
    faux_sdk.echoue = True
    assert _poster(client).status_code == 502
    assert db_session.query(CoutIA).filter(CoutIA.usage == "reecriture_passage").count() == 0
