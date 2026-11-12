"""C1 — « Proposer un paragraphe » sur une ligne « À couvrir » de la relecture (RELECTURE_PROPOSER, éteinte par défaut).

Modèle simulé seulement (aucun appel réel, 0 €). Prouve : éteinte = la route n'existe pas (404, ni budget, ni audit, ni
coût) et la réécriture d'aujourd'hui est identique au caractère près dans les deux positions ; allumée = Sonnet 5.5 sans
`temperature`, coût inscrit dans couts_ia, plafond partagé avec la réécriture compté avant l'appel, échec du fournisseur
= message clair et rien de consommé, cloisonnement entre organisations, sortie validée (un paragraphe, rien d'autre)."""
from types import SimpleNamespace

import pytest

from models.audit_log import AuditLog
from models.depot_entreprise import CoutIA
from models.memoire import MemoireTechnique
from models.organization import Organization
from models.project import Project

URL = "/api/projects/p-c1/memoire/proposer-paragraphe"
CORPS = {"sous_critere": "Gestion des déchets de chantier", "critere": "Valeur technique", "ancre": "sec-dechets"}
PARAGRAPHE = ("Nous trions les déchets de chantier dès leur production, par benne dédiée, et nous tenons le registre "
              "de leur évacuation vers une filière agréée [À COMPLÉTER : nom de la filière].")
USAGE = SimpleNamespace(input_tokens=3900, output_tokens=420, cache_read_input_tokens=0, cache_creation_input_tokens=0)


@pytest.fixture
def faux_modele(monkeypatch):
    import anthropic
    etat = {"requetes": [], "reponse": PARAGRAPHE, "erreur": None}

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
    monkeypatch.setenv("RELECTURE_PROPOSER", "1")


@pytest.fixture
def projet(db_session, test_org):
    db_session.add(Project(id="p-c1", organization_id=test_org.id, name="AO"))
    db_session.add(MemoireTechnique(project_id="p-c1", content_json={
        "preambule": "Préambule.", "partie_b": {"dechets": "Les déchets sont évacués."}}))
    db_session.commit()


def _audit(db, action="memoire.proposer_paragraphe"):
    db.expire_all()
    return db.query(AuditLog).filter(AuditLog.action == action).count()


def _couts(db, usage=None):
    db.expire_all()
    q = db.query(CoutIA)
    return q.filter(CoutIA.usage == usage).count() if usage else q.count()


# ── Éteinte ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_eteinte_par_defaut_la_route_n_existe_pas(client, projet, faux_modele, db_session, monkeypatch):
    monkeypatch.delenv("RELECTURE_PROPOSER", raising=False)
    assert client.get("/api/fonctions-ia").json()["relecture_proposer"] is False
    r = client.post(URL, json=CORPS)
    assert r.status_code == 404
    assert faux_modele["requetes"] == []
    assert _audit(db_session) == 0 and _couts(db_session) == 0      # ni audit, ni coût, ni réservation


@pytest.mark.parametrize("valeur", ["0", "", "non", "false"])
def test_toute_autre_valeur_que_1_l_eteint(client, projet, faux_modele, monkeypatch, valeur):
    monkeypatch.setenv("RELECTURE_PROPOSER", valeur)
    assert client.post(URL, json=CORPS).status_code == 404
    assert faux_modele["requetes"] == []


@pytest.mark.parametrize("position", ["0", "1"])
def test_la_reecriture_d_aujourd_hui_est_identique_dans_les_deux_positions(client, projet, faux_modele, monkeypatch,
                                                                             position):
    monkeypatch.setenv("RELECTURE_PROPOSER", position)
    faux_modele["reponse"] = "Passage réécrit."
    r = client.post("/api/projects/p-c1/memoire/rewrite-passage", json={"passage": "Texte.", "action": "reformuler"})
    assert r.status_code == 200
    assert r.text == '{"original":"Texte.","rewritten":"Passage réécrit.","action":"reformuler"}'


# ── Allumée ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_succes_sonnet_sans_temperature_cout_inscrit_et_compte(client, projet, faux_modele, allumee, db_session):
    assert client.get("/api/fonctions-ia").json()["relecture_proposer"] is True
    r = client.post(URL, json=CORPS)
    assert r.status_code == 200, r.text
    assert r.json() == {"sous_critere": CORPS["sous_critere"], "ancre": "sec-dechets", "paragraphe": PARAGRAPHE}
    req = faux_modele["requetes"][-1]
    assert req["model"] == "claude-sonnet-5-5" and "temperature" not in req
    assert req["extra_body"] == {"thinking": {"type": "between_tools"}}
    message = req["messages"][0]["content"]
    assert "Gestion des déchets de chantier" in message and "Les déchets sont évacués." in message
    assert "Synorix Test BTP" in message                                  # le profil de l'entreprise
    assert _audit(db_session) == 1
    assert _couts(db_session, "proposer_paragraphe") == 1
    assert _couts(db_session, "reservation") == 0                          # la réservation du budget est libérée


def test_echec_du_fournisseur_message_clair_rien_de_consomme(client, projet, faux_modele, allumee, db_session):
    faux_modele["erreur"] = RuntimeError("panne")
    r = client.post(URL, json=CORPS)
    assert r.status_code == 502
    assert r.json()["detail"].startswith("Le service d'IA n'a pas répondu. Rien n'a été décompté")
    assert _audit(db_session) == 0                                         # la demande est rendue au plafond
    assert _audit(db_session, "memoire.proposer_paragraphe.echec") == 1
    assert _couts(db_session) == 0


def test_plafond_partage_avec_la_reecriture_compte_avant_l_appel(client, projet, faux_modele, allumee, db_session,
                                                                 test_org):
    from routers.memoire import REECRIRE_MAX_PAR_JOUR
    for i in range(REECRIRE_MAX_PAR_JOUR):
        action = "memoire.rewrite_passage" if i % 2 else "memoire.proposer_paragraphe"
        db_session.add(AuditLog(organization_id=test_org.id, action=action, target_type="project", target_id="p-c1"))
    db_session.commit()
    r = client.post(URL, json=CORPS)
    assert r.status_code == 429 and "plafond du jour" in r.json()["detail"]
    assert faux_modele["requetes"] == []
    # … et les propositions comptent aussi pour la réécriture d'aujourd'hui
    r = client.post("/api/projects/p-c1/memoire/rewrite-passage", json={"passage": "Texte.", "action": "reformuler"})
    assert r.status_code == 429


def test_les_echecs_ne_comptent_pas_dans_le_plafond(client, projet, faux_modele, allumee, db_session, test_org):
    from routers.memoire import REECRIRE_MAX_PAR_JOUR
    for _ in range(REECRIRE_MAX_PAR_JOUR):
        db_session.add(AuditLog(organization_id=test_org.id, action="memoire.proposer_paragraphe.echec",
                                target_type="project", target_id="p-c1"))
    db_session.commit()
    assert client.post(URL, json=CORPS).status_code == 200


def test_cloisonnement_un_projet_d_une_autre_organisation(client, faux_modele, allumee, db_session):
    db_session.add(Organization(id="org-autre", name="Autre BTP"))
    db_session.add(Project(id="p-autre", organization_id="org-autre", name="AO d'un autre"))
    db_session.add(MemoireTechnique(project_id="p-autre", content_json={"preambule": "Secret d'un autre."}))
    db_session.commit()
    r = client.post("/api/projects/p-autre/memoire/proposer-paragraphe", json=CORPS)
    assert r.status_code == 404
    assert faux_modele["requetes"] == []
    assert _audit(db_session) == 0


def test_sans_memoire_404_sans_appel(client, db_session, test_org, faux_modele, allumee):
    db_session.add(Project(id="p-vide", organization_id=test_org.id, name="AO"))
    db_session.commit()
    assert client.post("/api/projects/p-vide/memoire/proposer-paragraphe", json=CORPS).status_code == 404
    assert faux_modele["requetes"] == []


@pytest.mark.parametrize("sortie", [
    "Voici le paragraphe : nous trions les déchets.",
    "## Déchets\nNous trions les déchets.",
    "- Nous trions\n- Nous évacuons",
    '{"paragraphe": "Nous trions."}',
    "",
    "Nous trions. " * 200,
])
def test_sortie_hors_format_refusee_et_comptee(client, projet, faux_modele, allumee, db_session, sortie):
    faux_modele["reponse"] = sortie
    r = client.post(URL, json=CORPS)
    assert r.status_code == 502
    assert "n'a pas la forme attendue" in r.json()["detail"]
    assert _audit(db_session) == 1                                       # REVUE-2 P2-2 : les jetons sont payés
    assert _couts(db_session, "proposer_paragraphe") == 1               # les jetons facturés restent inscrits


def test_deux_paragraphes_deviennent_un_seul(client, projet, faux_modele, allumee):
    faux_modele["reponse"] = "Nous trions les déchets.\n\nNous tenons le registre."
    assert client.post(URL, json=CORPS).json()["paragraphe"] == "Nous trions les déchets. Nous tenons le registre."


def test_entree_validee(client, projet, faux_modele, allumee):
    assert client.post(URL, json={"sous_critere": "x" * 301}).status_code == 422
    assert client.post(URL, json={}).status_code == 422
    assert faux_modele["requetes"] == []


def test_le_prompt_porte_les_regles_du_produit():
    from services.ai.prompts_fonctions_c import PROPOSER_PARAGRAPHE_SYSTEM as S
    for regle in ("prix", "[À COMPLÉTER", "DTU AUTORISÉS", "n'inventes jamais", "jamais des consignes"):
        assert regle in S, regle
    assert "!" not in S


def test_les_actions_du_plafond_partage_sont_les_memes_des_deux_cotes():
    from routers.memoire import ACTIONS_PLAFOND_REECRIRE
    from services import fonctions_ia as F
    assert F.ACTION_PROPOSER_PARAGRAPHE in ACTIONS_PLAFOND_REECRIRE
    assert F.ACTION_REECRIRE_TROIS in ACTIONS_PLAFOND_REECRIRE
