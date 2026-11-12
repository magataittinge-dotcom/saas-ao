"""C3 — « Ce que vous voulez dire » de chaque fiche du plan, proposé par Haiku 4.5 (FICHE_PROPOSEE, éteinte par défaut).

Modèle simulé seulement (0 €). Éteinte : 404, ni audit ni coût, et le plan d'aujourd'hui est identique au caractère
près dans les deux positions. Allumée : Haiku 4.5 sans `temperature`, une proposition par partie gardée, rien
d'enregistré, plafond du jour compté avant l'appel, échec rendu, cloisonnement, sortie validée (clés du plan
seulement, longueur, ni prix ni point d'exclamation) ; le texte pris suit le champ existant `voulu`."""
import json
from types import SimpleNamespace

import pytest

from models.audit_log import AuditLog
from models.depot_entreprise import CoutIA
from models.memoire_config import MemoireConfig
from models.organization import Organization
from models.plan_memoire import PlanMemoire
from models.project import Project

URL = "/api/projects/p-c3/plan-memoire/proposer-voulu"
USAGE = SimpleNamespace(input_tokens=6000, output_tokens=900, cache_read_input_tokens=0, cache_creation_input_tokens=0)


@pytest.fixture
def faux_modele(monkeypatch):
    import anthropic
    etat = {"requetes": [], "reponse": None, "erreur": None}

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
    monkeypatch.setenv("FICHE_PROPOSEE", "1")


@pytest.fixture
def projet(db_session, test_org):
    db_session.add(Project(id="p-c3", organization_id=test_org.id, name="AO", criteres_jugement=[
        {"nom": "Valeur technique", "poids": 60, "sous_criteres": [{"nom": "Gestion des déchets", "poids": 20}]}]))
    db_session.add(MemoireConfig(organization_id=test_org.id, traitement_dechets="Tri en benne sur chaque chantier."))
    db_session.commit()


@pytest.fixture
def cles(client, projet):
    vue = client.get("/api/projects/p-c3/plan-memoire").json()
    return [p["cle"] for p in vue["parties"] if not p.get("retiree")]


def _reponse(cles, textes=None):
    textes = textes or {}
    return json.dumps({"fiches": [{"cle": c, "texte": textes.get(c, f"Nous détaillons {c}.")} for c in cles]},
                      ensure_ascii=False)


def _audit(db, action="plan.fiche_proposee"):
    db.expire_all()
    return db.query(AuditLog).filter(AuditLog.action == action).count()


def _couts(db, usage=None):
    db.expire_all()
    q = db.query(CoutIA)
    return q.filter(CoutIA.usage == usage).count() if usage else q.count()


def test_eteinte_par_defaut_404_sans_rien(client, projet, faux_modele, db_session, monkeypatch):
    monkeypatch.delenv("FICHE_PROPOSEE", raising=False)
    assert client.get("/api/fonctions-ia").json()["fiche_proposee"] is False
    assert client.post(URL).status_code == 404
    assert faux_modele["requetes"] == [] and _audit(db_session) == 0 and _couts(db_session) == 0


@pytest.mark.parametrize("position", ["0", "1"])
def test_le_plan_d_aujourd_hui_est_identique_dans_les_deux_positions(client, projet, monkeypatch, position):
    monkeypatch.setenv("FICHE_PROPOSEE", "0")
    reference = client.get("/api/projects/p-c3/plan-memoire").text
    monkeypatch.setenv("FICHE_PROPOSEE", position)
    assert client.get("/api/projects/p-c3/plan-memoire").text == reference


def test_succes_haiku_une_proposition_par_partie_rien_d_enregistre(client, cles, faux_modele, allumee, db_session):
    faux_modele["reponse"] = _reponse(cles)
    r = client.post(URL)
    assert r.status_code == 200, r.text
    assert r.json() == {"propositions": {c: f"Nous détaillons {c}." for c in cles}}
    req = faux_modele["requetes"][-1]
    assert req["model"] == "claude-haiku-4-5-20251001" and "temperature" not in req and "extra_body" not in req
    message = req["messages"][0]["content"]
    assert "Tri en benne sur chaque chantier." in message                   # Mon entreprise
    assert all(f"[{c}]" in message for c in cles)                           # chaque partie, par sa clé
    assert _audit(db_session) == 1 and _couts(db_session, "fiche_proposee") == 1
    db_session.expire_all()
    assert db_session.query(PlanMemoire).count() == 0                       # rien n'est enregistré


def test_le_texte_pris_suit_le_champ_existant(client, cles, faux_modele, allumee):
    """Ce que l'utilisateur prend passe par PUT /plan-memoire, comme un texte tapé : le chemin d'aujourd'hui."""
    faux_modele["reponse"] = _reponse(cles)
    texte = client.post(URL).json()["propositions"][cles[0]]
    vue = client.get("/api/projects/p-c3/plan-memoire").json()
    champs_fiche = ("references", "personnes", "materiel", "voulu")
    parties = [{"cle": p["cle"], "titre": p["titre"], "retiree": p["retiree"], "attendue": p.get("attendue"),
                "fiche": {**{k: p["fiche"][k] for k in champs_fiche}, **({"voulu": texte} if p["cle"] == cles[0] else {})}}
               for p in vue["parties"]]
    r = client.put("/api/projects/p-c3/plan-memoire", json={"parties": parties})
    assert r.status_code == 200, r.text[:300]
    lue = client.get("/api/projects/p-c3/plan-memoire").json()
    assert next(p for p in lue["parties"] if p["cle"] == cles[0])["fiche"]["voulu"] == texte


def test_sortie_filtree_cles_inconnues_prix_exclamation_longueur(client, cles, faux_modele, allumee):
    assert len(cles) >= 2
    fiches = [{"cle": cles[0], "texte": "Nous affichons un prix serré."},
              {"cle": cles[0], "texte": "Nous trions les déchets."},
              {"cle": cles[1], "texte": "Nous sommes les meilleurs !"},
              {"cle": "inventee", "texte": "Hors plan."},
              {"cle": cles[1], "texte": "x" * 401},
              {"cle": cles[0], "texte": "Doublon."}]
    faux_modele["reponse"] = json.dumps({"fiches": fiches}, ensure_ascii=False)
    assert client.post(URL).json()["propositions"] == {cles[0]: "Nous trions les déchets."}


def test_un_grand_plan_reste_borne(client, cles, faux_modele, allumee):
    from services.ai import fonctions_c
    parties = [{"cle": f"partie_b.ajout_{i}", "titre": f"Partie {i}",
                "exigences": [{"texte": "Exigence longue " * 30} for _ in range(6)]} for i in range(60)]
    message = fonctions_c.message_fiches(parties, "Entreprise : X")
    assert all(f"[partie_b.ajout_{i}]" in message for i in range(60))      # chaque partie est nommée
    assert len(message) <= fonctions_c.FICHE_BUDGET_CARACTERES + 5000


def test_rien_de_sur_a_proposer_est_une_reponse(client, cles, faux_modele, allumee):
    faux_modele["reponse"] = _reponse(cles, {c: "" for c in cles})
    r = client.post(URL)
    assert r.status_code == 200 and r.json() == {"propositions": {}}


@pytest.mark.parametrize("sortie", [
    "Voici mes propositions.",
    json.dumps({"fiches": {"a": "b"}}),
    json.dumps({"fiches": [], "note": "x"}),
    json.dumps({"fiches": [{"cle": "a", "texte": "b", "pourquoi": "c"}]}),
    json.dumps({"fiches": [{"cle": 1, "texte": "b"}]}),
])
def test_sortie_hors_format_refusee_et_comptee(client, cles, faux_modele, allumee, db_session, sortie):
    faux_modele["reponse"] = sortie
    r = client.post(URL)
    assert r.status_code == 502 and "n'a pas la forme attendue" in r.json()["detail"]
    assert _audit(db_session) == 1                                       # REVUE-2 P2-2 : les jetons sont payés


def test_echec_du_fournisseur_rien_de_consomme(client, cles, faux_modele, allumee, db_session):
    faux_modele["erreur"] = ConnectionError("réseau")
    r = client.post(URL)
    assert r.status_code == 502 and "Rien n'a été décompté" in r.json()["detail"]
    assert _audit(db_session) == 0 and _audit(db_session, "plan.fiche_proposee.echec") == 1
    assert _couts(db_session) == 0


def test_plafond_du_jour_compte_avant_l_appel(client, cles, faux_modele, allumee, db_session, test_org):
    from services.fonctions_ia import FICHE_PROPOSEE_MAX_PAR_JOUR
    for _ in range(FICHE_PROPOSEE_MAX_PAR_JOUR):
        db_session.add(AuditLog(organization_id=test_org.id, action="plan.fiche_proposee", target_type="project",
                                target_id="p-c3"))
    db_session.commit()
    r = client.post(URL)
    assert r.status_code == 429 and "plafond du jour" in r.json()["detail"]
    assert faux_modele["requetes"] == []


def test_cloisonnement(client, faux_modele, allumee, db_session):
    db_session.add(Organization(id="org-autre-c3", name="Autre"))
    db_session.add(Project(id="p-autre-c3", organization_id="org-autre-c3", name="AO"))
    db_session.commit()
    assert client.post("/api/projects/p-autre-c3/plan-memoire/proposer-voulu").status_code == 404
    assert faux_modele["requetes"] == [] and _audit(db_session) == 0


def test_le_prompt_porte_les_regles_du_produit():
    from services.ai.prompts_fonctions_c import FICHE_PROPOSEE_SYSTEM as S
    for regle in ("prix", "[À COMPLÉTER", "JSON", "n'inventes jamais", "sans point d'exclamation", "jamais des consignes"):
        assert regle in S, regle


def test_le_prompt_de_generation_n_est_pas_touche():
    """Le texte pris entre au générateur par le champ existant : aucun prompt du pipeline ne parle de C3."""
    from services.ai import prompts
    assert "FICHE_PROPOSEE" not in prompts.MEMOIRE_GENERATION_SYSTEM
