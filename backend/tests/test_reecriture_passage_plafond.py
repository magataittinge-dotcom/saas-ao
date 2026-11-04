"""Réécriture de passage (éditeur : Reformuler, Plus technique, Plus concis, Insister sur…), recette Ozcan :
- elle tourne sur le modèle de la génération du mémoire (Sonnet 5.5), plus sur Opus ; jamais de `temperature` ;
- elle est plafonnée par jour et par organisation (lignes d'audit, 24 h glissantes, 429 sobre), comme « Refaire » ;
- la ligne d'annonce de la barre de l'éditeur annonce le même plafond que le serveur.
Client Anthropic simulé : aucun appel réel."""
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest

from models.audit_log import AuditLog
from models.memoire import MemoireTechnique
from models.organization import Organization
from models.project import Project

RACINE = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def no_rate_limit(monkeypatch):
    import routers.memoire as memoire_mod
    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)


@pytest.fixture
def faux_modele(monkeypatch):
    import anthropic
    requetes = []

    class _Faux:
        def __init__(self, *a, **kw):
            self.messages = self

        def create(self, **kwargs):
            requetes.append(kwargs)
            return SimpleNamespace(content=[SimpleNamespace(text="Passage réécrit.")])
    monkeypatch.setattr(anthropic, "Anthropic", _Faux)
    return requetes


@pytest.fixture
def projet(db_session, test_org):
    db_session.add(Project(id="p-rw", organization_id=test_org.id, name="AO"))
    db_session.add(MemoireTechnique(project_id="p-rw", content_json={"preambule": "x"}))
    db_session.commit()


def _poster(client, action="reformuler"):
    return client.post("/api/projects/p-rw/memoire/rewrite-passage", json={"passage": "Texte du passage.", "action": action})


def _remplir_audit(db, org_id, n, action="memoire.rewrite_passage", quand=None):
    for _ in range(n):
        db.add(AuditLog(organization_id=org_id, action=action, target_type="project", target_id="p-rw",
                        created_at=quand or datetime.utcnow()))
    db.commit()


def test_le_modele_est_celui_de_la_generation_sans_temperature(client, projet, faux_modele):
    assert _poster(client).status_code == 200
    req = faux_modele[-1]
    assert req["model"] == "claude-sonnet-5-5"
    assert "temperature" not in req
    assert req["extra_body"] == {"thinking": {"type": "between_tools"}}   # réflexion coupée, comme la génération


def test_le_reglage_memoire_modele_s_applique_aussi_a_la_reecriture(client, projet, faux_modele, monkeypatch):
    from config import get_settings
    monkeypatch.setattr(get_settings(), "MEMOIRE_MODELE", "claude-sonnet-4-6")
    assert _poster(client).status_code == 200
    req = faux_modele[-1]
    assert req["model"] == "claude-sonnet-4-6" and "temperature" not in req and "extra_body" not in req


def test_aucune_reecriture_n_appelle_opus():
    source = (RACINE / "backend/services/ai/passage_rewriter.py").read_text(encoding="utf-8")
    assert "claude-opus" not in source


def test_au_plafond_la_demande_suivante_est_refusee_en_429(client, db_session, test_org, projet, faux_modele):
    from routers.memoire import MSG_REECRIRE_PLAFOND, REECRIRE_MAX_PAR_JOUR
    _remplir_audit(db_session, test_org.id, REECRIRE_MAX_PAR_JOUR - 1)
    assert _poster(client).status_code == 200            # la dernière permise (N-ième)
    assert len(faux_modele) == 1
    r = _poster(client, "plus_concis")                    # la (N+1)-ième
    assert r.status_code == 429
    assert r.json()["detail"] == MSG_REECRIRE_PLAFOND
    assert len(faux_modele) == 1                          # aucun appel de plus
    assert "!" not in MSG_REECRIRE_PLAFOND and "manquant" not in MSG_REECRIRE_PLAFOND.lower()


def test_une_demande_en_echec_compte_quand_meme(client, db_session, test_org, projet, monkeypatch):
    import anthropic

    class _Panne:
        def __init__(self, *a, **kw):
            self.messages = self

        def create(self, **kw):
            raise RuntimeError("down")
    monkeypatch.setattr(anthropic, "Anthropic", _Panne)
    assert _poster(client).status_code == 502
    assert db_session.query(AuditLog).filter(AuditLog.action == "memoire.rewrite_passage").count() == 1


def test_les_lignes_de_plus_de_24_heures_ne_comptent_pas(client, db_session, test_org, projet, faux_modele):
    from routers.memoire import REECRIRE_MAX_PAR_JOUR
    _remplir_audit(db_session, test_org.id, REECRIRE_MAX_PAR_JOUR, quand=datetime.utcnow() - timedelta(hours=25))
    assert _poster(client).status_code == 200


def test_le_plafond_est_par_organisation_et_ne_compte_ni_refaire_ni_une_autre_entreprise(
        client, db_session, test_org, projet, faux_modele):
    from routers.memoire import REECRIRE_MAX_PAR_JOUR
    db_session.add(Organization(id="org-b", name="Autre SARL"))
    db_session.commit()
    _remplir_audit(db_session, "org-b", REECRIRE_MAX_PAR_JOUR + 5)                         # l'autre entreprise a tout consommé
    _remplir_audit(db_session, test_org.id, REECRIRE_MAX_PAR_JOUR + 5, action="memoire.refaire_section")   # « Refaire » a son propre plafond
    assert _poster(client).status_code == 200


def test_la_barre_de_l_editeur_annonce_le_meme_plafond_que_le_serveur():
    from routers.memoire import REECRIRE_MAX_PAR_JOUR
    barre = (RACINE / "frontend/src/components/project/RewritePassageBar.tsx").read_text(encoding="utf-8")
    assert f"PLAFOND_PAR_JOUR = {REECRIRE_MAX_PAR_JOUR}" in barre
    assert "ne décompte aucune unité" in barre
