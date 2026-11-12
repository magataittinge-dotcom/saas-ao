"""C2 — la réécriture d'un passage en trois propositions (REECRIRE_TROIS, éteinte par défaut).

Modèle simulé seulement (0 €). Éteinte : la route n'existe pas (404, ni audit ni coût) et la réécriture à une
proposition d'aujourd'hui est identique au caractère près, y compris sa requête au modèle. Allumée : même modèle, même
consigne de geste, même règle DTU ; trois textes validés ; plafond partagé ; échec rendu ; cloisonnement."""
import json
from types import SimpleNamespace

import pytest

from models.audit_log import AuditLog
from models.depot_entreprise import CoutIA
from models.memoire import MemoireTechnique
from models.organization import Organization
from models.project import Project

URL = "/api/projects/p-c2/memoire/reecrire-trois"
CORPS = {"passage": "Nous posons les menuiseries selon les règles de l'art.", "action": "reformuler"}
TROIS = ["Les menuiseries sont posées selon les règles de l'art.",
         "La pose des menuiseries suit les règles de l'art.",
         "Nous assurons la pose des menuiseries dans les règles de l'art."]
USAGE = SimpleNamespace(input_tokens=700, output_tokens=180, cache_read_input_tokens=0, cache_creation_input_tokens=0)


@pytest.fixture
def faux_modele(monkeypatch):
    import anthropic
    etat = {"requetes": [], "reponse": json.dumps({"propositions": TROIS}, ensure_ascii=False), "erreur": None}

    class _Faux:
        def __init__(self, *a, **kw):
            self.messages = self

        def create(self, **kwargs):
            etat["requetes"].append(kwargs)
            if etat["erreur"]:
                raise etat["erreur"]
            return SimpleNamespace(content=[SimpleNamespace(text=etat["reponse"])], usage=USAGE)
    monkeypatch.setattr(anthropic, "Anthropic", _Faux)
    return etat


@pytest.fixture
def allumee(monkeypatch):
    monkeypatch.setenv("REECRIRE_TROIS", "1")


@pytest.fixture
def projet(db_session, test_org):
    db_session.add(Project(id="p-c2", organization_id=test_org.id, name="AO"))
    db_session.add(MemoireTechnique(project_id="p-c2", content_json={"preambule": "x"}))
    db_session.commit()


def _audit(db, action="memoire.reecrire_trois"):
    db.expire_all()
    return db.query(AuditLog).filter(AuditLog.action == action).count()


def _couts(db, usage=None):
    db.expire_all()
    q = db.query(CoutIA)
    return q.filter(CoutIA.usage == usage).count() if usage else q.count()


def test_eteinte_par_defaut_404_sans_rien(client, projet, faux_modele, db_session, monkeypatch):
    monkeypatch.delenv("REECRIRE_TROIS", raising=False)
    assert client.get("/api/fonctions-ia").json()["reecrire_trois"] is False
    assert client.post(URL, json=CORPS).status_code == 404
    assert faux_modele["requetes"] == [] and _audit(db_session) == 0 and _couts(db_session) == 0


@pytest.mark.parametrize("position", ["0", "1"])
def test_la_reecriture_a_une_proposition_est_identique_dans_les_deux_positions(client, projet, faux_modele,
                                                                                monkeypatch, position):
    """La route d'aujourd'hui : même réponse ET même requête au modèle, caractère pour caractère."""
    monkeypatch.setenv("REECRIRE_TROIS", position)
    faux_modele["reponse"] = "Passage réécrit."
    r = client.post("/api/projects/p-c2/memoire/rewrite-passage", json=CORPS)
    assert r.status_code == 200
    assert r.text == ('{"original":"Nous posons les menuiseries selon les règles de l\'art.",'
                      '"rewritten":"Passage réécrit.","action":"reformuler"}')
    req = faux_modele["requetes"][-1]
    from services.ai.passage_rewriter import _SYSTEM
    assert req["system"] == _SYSTEM
    assert req["messages"][0]["content"].startswith("Reformule ce passage en gardant strictement le même sens")


def test_succes_trois_propositions_meme_modele_meme_consigne(client, projet, faux_modele, allumee, db_session):
    r = client.post(URL, json=CORPS)
    assert r.status_code == 200, r.text
    assert r.json() == {"original": CORPS["passage"], "propositions": TROIS, "action": "reformuler"}
    req = faux_modele["requetes"][-1]
    assert req["model"] == "claude-sonnet-5-5" and "temperature" not in req
    assert req["extra_body"] == {"thinking": {"type": "between_tools"}}
    from services.ai.passage_rewriter import ACTIONS
    assert ACTIONS["reformuler"] in req["messages"][0]["content"]
    assert CORPS["passage"] in req["messages"][0]["content"]
    assert _audit(db_session) == 1 and _couts(db_session, "reecrire_trois") == 1
    assert _couts(db_session, "reservation") == 0


def test_insister_passe_la_consigne(client, projet, faux_modele, allumee):
    r = client.post(URL, json={**CORPS, "action": "insister", "instruction": "la sécurité"})
    assert r.status_code == 200
    assert "insistant sur : la sécurité" in faux_modele["requetes"][-1]["messages"][0]["content"]


def test_action_inconnue_422_sans_appel(client, projet, faux_modele, allumee):
    assert client.post(URL, json={**CORPS, "action": "traduire"}).status_code == 422
    assert faux_modele["requetes"] == []


def test_echec_du_fournisseur_rien_de_consomme(client, projet, faux_modele, allumee, db_session):
    faux_modele["erreur"] = TimeoutError("lent")
    r = client.post(URL, json=CORPS)
    assert r.status_code == 502 and "Rien n'a été décompté" in r.json()["detail"]
    assert _audit(db_session) == 0 and _audit(db_session, "memoire.reecrire_trois.echec") == 1
    assert _couts(db_session) == 0


def test_plafond_partage_compte_avant_l_appel(client, projet, faux_modele, allumee, db_session, test_org):
    from routers.memoire import REECRIRE_MAX_PAR_JOUR
    for i in range(REECRIRE_MAX_PAR_JOUR):
        action = ("memoire.rewrite_passage", "memoire.proposer_paragraphe", "memoire.reecrire_trois")[i % 3]
        db_session.add(AuditLog(organization_id=test_org.id, action=action, target_type="project", target_id="p-c2"))
    db_session.commit()
    assert client.post(URL, json=CORPS).status_code == 429
    assert faux_modele["requetes"] == []


def test_cloisonnement(client, faux_modele, allumee, db_session):
    db_session.add(Organization(id="org-autre-c2", name="Autre"))
    db_session.add(Project(id="p-autre-c2", organization_id="org-autre-c2", name="AO"))
    db_session.commit()
    assert client.post("/api/projects/p-autre-c2/memoire/reecrire-trois", json=CORPS).status_code == 404
    assert faux_modele["requetes"] == [] and _audit(db_session) == 0


@pytest.mark.parametrize("sortie", [
    "Voici trois propositions : 1. … 2. … 3. …",
    json.dumps({"propositions": TROIS[:2]}),
    json.dumps({"propositions": TROIS + ["Une quatrième."]}),
    json.dumps({"propositions": [TROIS[0], TROIS[0], TROIS[0]]}),
    json.dumps({"propositions": [TROIS[0], "", TROIS[2]]}),
    json.dumps({"propositions": TROIS, "commentaire": "J'ai fait de mon mieux."}),
    json.dumps({"propositions": [TROIS[0], TROIS[1], "x" * 5000]}),
    json.dumps({"propositions": [1, 2, 3]}),
])
def test_sortie_hors_format_refusee(client, projet, faux_modele, allumee, db_session, sortie):
    faux_modele["reponse"] = sortie
    r = client.post(URL, json=CORPS)
    assert r.status_code == 502 and "n'a pas la forme attendue" in r.json()["detail"]
    assert _audit(db_session) == 1                                       # REVUE-2 P2-2 : les jetons sont payés


def test_deux_identiques_sur_trois_en_laisse_deux(client, projet, faux_modele, allumee):
    faux_modele["reponse"] = json.dumps({"propositions": [TROIS[0], TROIS[0], TROIS[1]]})
    assert client.post(URL, json=CORPS).json()["propositions"] == [TROIS[0], TROIS[1]]


def test_dtu_hors_liste_retire_de_chaque_proposition(client, projet, faux_modele, allumee):
    faux_modele["reponse"] = json.dumps({"propositions": [t + " Conforme au DTU 36.5." for t in TROIS]})
    propositions = client.post(URL, json=CORPS).json()["propositions"]
    assert all("36.5" not in p for p in propositions)


def test_le_prompt_porte_les_regles_du_produit():
    from services.ai.prompts_fonctions_c import REECRIRE_TROIS_SYSTEM as S
    for regle in ("prix", "JSON", "exactement trois", "DTU AUTORISÉS", "n'inventes JAMAIS"):
        assert regle in S, regle
