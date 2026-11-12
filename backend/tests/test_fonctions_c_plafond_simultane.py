"""REVUE-2 P2-1 et P2-2 — le plafond du jour des fonctions C1, C2 (partagé avec la réécriture : 60) et C4.

P2-1 : la place était contrôlée AVANT une attente (`regle_dtu` dans un fil, lecture du fichier) et comptée APRÈS ; des
demandes simultanées passaient toutes le contrôle (59 sur 60, 5 demandes → 5 acceptées, 64 comptées). Elle est
désormais réservée sous verrou avant l'attente, et rendue si la demande échoue avant l'appel au modèle.
P2-2 : une sortie hors format compte dans le plafond (ses jetons sont payés et inscrits).
Modèle simulé (0 €)."""
import asyncio
import json
import time
from types import SimpleNamespace

import pytest

from models.audit_log import AuditLog
from models.memoire import MemoireTechnique
from models.project import Project

USAGE = SimpleNamespace(input_tokens=700, output_tokens=180, cache_read_input_tokens=0, cache_creation_input_tokens=0)
TROIS = ["Les menuiseries sont posées selon les règles de l'art.",
         "La pose des menuiseries suit les règles de l'art.",
         "Nous assurons la pose des menuiseries dans les règles de l'art."]
PARAGRAPHE = ("Nous trions les déchets de chantier dès leur production, par benne dédiée, et nous tenons le registre "
              "de leur évacuation vers une filière agréée.")
C1 = ("/api/projects/p-plafond/memoire/proposer-paragraphe", {"sous_critere": "Gestion des déchets de chantier"},
      "memoire.proposer_paragraphe")
C2 = ("/api/projects/p-plafond/memoire/reecrire-trois",
      {"passage": "Nous posons les menuiseries selon les règles de l'art.", "action": "reformuler"},
      "memoire.reecrire_trois")
REPONSES = {C1[2]: PARAGRAPHE, C2[2]: json.dumps({"propositions": TROIS}, ensure_ascii=False)}


@pytest.fixture
def modele(monkeypatch):
    import anthropic
    etat = {"requetes": [], "reponse": None}

    class _Faux:
        def __init__(self, *a, **kw):
            self.messages = self

        def create(self, **kwargs):
            etat["requetes"].append(kwargs)
            return SimpleNamespace(content=[SimpleNamespace(text=etat["reponse"])], usage=USAGE)
    monkeypatch.setattr(anthropic, "Anthropic", _Faux)
    return etat


@pytest.fixture
def dossier(db_session, test_org, monkeypatch):
    monkeypatch.setenv("RELECTURE_PROPOSER", "1")
    monkeypatch.setenv("REECRIRE_TROIS", "1")
    db_session.add(Project(id="p-plafond", organization_id=test_org.id, name="AO"))
    db_session.add(MemoireTechnique(project_id="p-plafond", content_json={"preambule": "Préambule."}))
    db_session.commit()


def _compte(db, action):
    db.expire_all()
    return db.query(AuditLog).filter(AuditLog.action == action).count()


def _remplir(db, org_id, action, n):
    for _ in range(n):
        db.add(AuditLog(organization_id=org_id, action=action))
    db.commit()


async def _simultanees(test_org, url, corps, n):
    """n demandes lancées en même temps sur l'application (une session de base par demande, comme en vrai)."""
    import httpx
    from fastapi import Request

    from main import app
    from models.user import User
    from routers.auth import get_auth_user, get_auth_user_short
    seul = User(id="user-test-1", email="test@example.com", name="Test", organization_id=test_org.id, role="admin")

    def _auth(request: Request):
        request.state.rl_key = f"org:{test_org.id}"
        return seul
    app.dependency_overrides[get_auth_user] = _auth
    app.dependency_overrides[get_auth_user_short] = _auth
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        reponses = await asyncio.gather(*[ac.post(url, json=corps) for _ in range(n)])
    return sorted(r.status_code for r in reponses)


@pytest.mark.asyncio
@pytest.mark.parametrize("fonction", [C1, C2], ids=["c1", "c2"])
async def test_p2_1_a_59_sur_60_cinq_demandes_simultanees_une_seule_acceptee(client, dossier, modele, db_session,
                                                                              test_org, monkeypatch, fonction):
    import routers.fonctions_ia as fia
    from routers.memoire import REECRIRE_MAX_PAR_JOUR
    url, corps, action = fonction
    modele["reponse"] = REPONSES[action]
    _remplir(db_session, test_org.id, action, REECRIRE_MAX_PAR_JOUR - 1)            # il reste UNE place
    vraie = fia.regle_dtu

    def lente(*a, **k):                                                              # élargit la fenêtre d'attente
        time.sleep(0.3)
        return vraie(*a, **k)
    monkeypatch.setattr(fia, "regle_dtu", lente)
    codes = await _simultanees(test_org, url, corps, 5)
    assert codes == [200, 429, 429, 429, 429]
    assert _compte(db_session, action) == REECRIRE_MAX_PAR_JOUR
    assert len(modele["requetes"]) == 1


def test_p2_1_echec_avant_l_appel_la_place_est_rendue(client, dossier, modele, db_session, monkeypatch):
    import routers.fonctions_ia as fia

    def en_panne(*a, **k):
        raise RuntimeError("lecture des pièces impossible")
    monkeypatch.setattr(fia, "regle_dtu", en_panne)
    url, corps, action = C2
    with pytest.raises(RuntimeError):
        client.post(url, json=corps)
    assert _compte(db_session, action) == 0                       # rendue : ne compte pas dans le plafond
    assert _compte(db_session, action + ".echec") == 1
    assert modele["requetes"] == []


def test_p2_1_c4_fichier_refuse_avant_l_appel_la_place_est_rendue(client, modele, db_session, monkeypatch):
    import io
    monkeypatch.setenv("STYLE_ENTREPRISE", "1")
    r = client.post("/api/entreprise/style", files={"file": ("m.txt", io.BytesIO(b"x" * 2000), "text/plain")})
    assert r.status_code == 415
    assert _compte(db_session, "entreprise.style_lu") == 0
    assert modele["requetes"] == []


# ── P2-2 : une sortie hors format compte dans le plafond (ses jetons sont payés) ──────────────────────────────────

@pytest.mark.parametrize("fonction", [C1, C2], ids=["c1", "c2"])
def test_p2_2_une_sortie_hors_format_compte_dans_le_plafond(client, dossier, modele, db_session, test_org, fonction):
    from routers.memoire import REECRIRE_MAX_PAR_JOUR
    url, corps, action = fonction
    modele["reponse"] = "## Titre\n- une liste, pas la forme attendue"
    _remplir(db_session, test_org.id, action, REECRIRE_MAX_PAR_JOUR - 1)
    r = client.post(url, json=corps)
    assert r.status_code == 502 and "n'a pas la forme attendue" in r.json()["detail"]
    assert "Rien n'a été décompté" not in r.json()["detail"]
    assert _compte(db_session, action) == REECRIRE_MAX_PAR_JOUR                # la demande payée compte
    assert client.post(url, json=corps).status_code == 429                     # le plafond tient
    assert len(modele["requetes"]) == 1
