"""B3 — le plan suivi dans le reste de l'application : lecture au moment de rédiger, « Refaire », export Word, relecture,
rattachement des sous-critères. Aucun appel réel ; données inventées."""
import io
import json
import threading
from datetime import datetime

import pytest
from docx import Document

from models.memoire import MemoireTechnique
from models.organization import Organization
from models.plan_memoire import PlanMemoire
from models.project import Project, ProjectDocument
from models.reference import Reference
from services import plan_memoire as pm
from services.docx_exporter import build_memoire_docx, compter_passages_a_completer
from services.memoire_criteres import rattacher
from services.relecture_memoire import relire_memoire, sections_du_memoire

PID = "proj-suivi"
PLAN_SUIVI = {"parties": [
    {"partie": "partie_a", "sous_cle": "historique", "titre": "Notre histoire"},
    {"partie": "partie_a", "sous_cle": "implantation", "titre": "Où nous sommes"},
    {"partie": "partie_b", "sous_cle": "dechets", "titre": "Gestion des déchets de chantier"},
    {"partie": "partie_c", "sous_cle": "ajout_1", "titre": "Suivi de chantier connecté"},
]}
CONTENU = {
    "preambule": "Préambule.",
    "partie_a": {"historique": "Fondée en 1999.", "implantation": "Caen."},
    "partie_b": {"dechets": "Tri sur site et benne dédiée."},
    "partie_c": {"ajout_1": "Tablettes et relevés quotidiens [À COMPLÉTER : outil]."},
    "_plan": PLAN_SUIVI,
}


def _lignes_word(contenu):
    return [p.text for p in Document(io.BytesIO(build_memoire_docx(contenu, "Chantier fictif", "Entreprise fictive"))).paragraphs]


def test_export_word_suit_le_plan_titres_ordre_et_parties_ajoutees():
    texte = _lignes_word(CONTENU)
    titres = [t for t in texte if t[:2] in ("1.", "2.", "3.")]
    assert "1. Notre histoire" in titres and "2. Où nous sommes" in titres      # ordre du plan, renumérotées
    assert "1. Gestion des déchets de chantier" in titres
    assert "1. Suivi de chantier connecté" in titres
    assert not any("Qualité des ouvrages" in t or "Implantation géographique" in t for t in texte)
    assert texte.index("1. Notre histoire") < texte.index("2. Où nous sommes")


def test_export_sans_plan_inchange():
    sans = {k: v for k, v in CONTENU.items() if k != "_plan"}
    sans["partie_c"] = {"delai": "Quatre mois."}
    texte = _lignes_word(sans)
    assert "1. Implantation géographique" in texte and "2. Historique" in texte and "7. Délai de travaux" in texte


def test_passages_a_completer_comptes_aussi_dans_une_partie_ajoutee():
    assert compter_passages_a_completer(CONTENU) == 1


def test_relecture_nomme_les_sections_du_plan():
    secs = sections_du_memoire(CONTENU)
    titres = [s.titre for s in secs]
    assert "Partie C · Suivi de chantier connecté" in titres and "Partie B · Gestion des déchets de chantier" in titres
    r = relire_memoire(CONTENU, criteres=[{"nom": "Valeur", "poids": 100, "sous_criteres": [
        {"nom": "Gestion et valorisation des déchets", "poids": 100}]}])
    assert r.en_dict()["lignes"] == [] or all("section" in l for l in r.en_dict()["lignes"])
    a_completer = [l for l in r.en_dict()["lignes"] if l["type"] == "a_completer"]
    assert a_completer and a_completer[0]["section"] == "Partie C · Suivi de chantier connecté"


def test_rattachement_compte_les_parties_ajoutees_par_leur_titre():
    contenu = {"partie_c": {"ajout_1": "Notre dispositif de suivi connecté suit les relevés connectés du chantier."},
               "_plan": {"parties": [{"partie": "partie_c", "sous_cle": "ajout_1", "titre": "Suivi connecté du chantier"}]}}
    criteres = [{"nom": "Valeur", "poids": 100, "sous_criteres": [{"nom": "Suivi connecté", "poids": 20}]}]
    r = rattacher(contenu, criteres)
    assert r["sous_criteres"][0]["sections"] == ["partie_c.ajout_1"] and r["a_couvrir"] == []


# ── Lecture du plan au moment de rédiger ─────────────────────────────────────

@pytest.fixture(autouse=True)
def _pas_de_limite(monkeypatch):
    import routers.memoire as memoire_mod
    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)


def _projet(db, org_id, plan=None, valide=True, avec_refs=True):
    db.get(Organization, org_id).plan = "pro"
    db.add(Project(id=PID, organization_id=org_id, name="AO suivi", selected_lot="lot1", selected_lot_name="Lot 1",
                   current_step=5, status="en_cours", processing_status="ready",
                   criteres_jugement=[{"nom": "Valeur", "poids": 100, "sous_criteres": [
                       {"nom": "Gestion et valorisation des déchets", "poids": 100}]}]))
    db.add(ProjectDocument(project_id=PID, type="rc", file_url="x", file_name="rc.pdf", extracted_text="RC. " * 30))
    db.add(MemoireTechnique(project_id=PID, version=1, content_json=json.loads(json.dumps(CONTENU)),
                            variables={}, profile_overrides=None))
    if avec_refs:
        db.add(Reference(id="ref-a", organization_id=org_id, intitule="ITE d'une école inventée", maitre_ouvrage="Ville X",
                         annee=2024, is_reference=True))
        db.add(Organization(id="org-autre", name="Autre"))
        db.add(Reference(id="ref-b", organization_id="org-autre", intitule="Chantier secret d'ailleurs", is_reference=True))
    if plan is not None:
        db.add(PlanMemoire(project_id=PID, organization_id=org_id, lot="lot1", parties=plan, version=1,
                           valide_le=datetime.utcnow() if valide else None))
    db.commit()


def _plan_stocke(**fiche_dechets):
    plan = pm.proposer([], [])
    for p in plan:
        if p["cle"] == "partie_b.dechets":
            p["titre"] = "Gestion des déchets de chantier"
            p["fiche"] = {"references": ["ref-a", "ref-b"], "personnes": None, "materiel": None,
                          "voulu": "Insister sur le tri.", **fiche_dechets}
    return pm.valider(plan + [pm._partie("partie_c.ajout_1", "Suivi de chantier connecté")])


def _contexte(db_session):
    from routers.memoire import _lire_contexte_generation
    return _lire_contexte_generation(db_session, PID, "org-test-1", None)


def test_pas_de_plan_ou_plan_non_valide_rien_ne_change(db_session, test_org):
    _projet(db_session, test_org.id)
    assert _contexte(db_session)["plan"] is None
    db_session.query(PlanMemoire).delete()
    db_session.add(PlanMemoire(project_id=PID, organization_id=test_org.id, lot="lot1", parties=_plan_stocke(),
                               version=1, valide_le=None))
    db_session.commit()
    assert _contexte(db_session)["plan"] is None


def test_plan_valide_lu_avec_fiches_et_sans_reference_d_une_autre_organisation(db_session, test_org):
    _projet(db_session, test_org.id, plan=_plan_stocke())
    plan = _contexte(db_session)["plan"]
    assert [p["sous_cle"] for p in plan if p["partie"] == "partie_c"][-1] == "ajout_1"
    d = next(p for p in plan if p["sous_cle"] == "dechets")
    assert d["titre"] == "Gestion des déchets de chantier" and d["voulu"] == "Insister sur le tri."
    assert d["criteres"] == [{"nom": "Gestion et valorisation des déchets", "poids": 100}]
    texte = " ".join(d["lignes"])
    assert "ITE d'une école inventée" in texte and "secret" not in texte
    assert next(p for p in plan if p["sous_cle"] == "ajout_1")["ajout"] is True


def test_plan_d_un_autre_lot_ou_organisation_jamais_lu(db_session, test_org):
    _projet(db_session, test_org.id)
    db_session.add(Organization(id="org-x", name="X"))
    db_session.add(PlanMemoire(project_id=PID, organization_id="org-x", lot="lot1", parties=_plan_stocke(),
                               version=1, valide_le=datetime.utcnow()))
    db_session.add(PlanMemoire(project_id=PID, organization_id=test_org.id, lot="lot9", parties=_plan_stocke(),
                               version=1, valide_le=datetime.utcnow()))
    db_session.commit()
    assert _contexte(db_session)["plan"] is None


# ── « Refaire cette partie » ──────────────────────────────────────────────────

def _joindre():
    for t in threading.enumerate():
        if t.name.startswith("synorix-refaire-"):
            t.join(timeout=30)


def _faux_refaire(monkeypatch):
    import routers.memoire as memoire_mod
    appels = []

    async def _faux(self, part, cle, **kwargs):
        appels.append((part, cle, kwargs))
        return "Texte refait.", {"segment": part}
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "refaire_section", _faux)
    return appels


def test_refaire_une_partie_ajoutee_reprend_son_titre_du_plan_suivi(client, db_session, test_org, monkeypatch):
    _projet(db_session, test_org.id)
    appels = _faux_refaire(monkeypatch)
    r = client.post(f"/api/projects/{PID}/memoire/sections/partie_c/ajout_1/refaire")
    assert r.status_code == 200, r.text
    _joindre()
    p = appels[0][2]["plan_partie"]
    assert p["titre"] == "Suivi de chantier connecté" and p["ajout"] is True
    db_session.expire_all()
    assert db_session.query(MemoireTechnique).first().content_json["partie_c"]["ajout_1"] == "Texte refait."


def test_refaire_une_partie_inconnue_ou_ajout_absent_du_plan_404(client, db_session, test_org, monkeypatch):
    _projet(db_session, test_org.id)
    _faux_refaire(monkeypatch)
    assert client.post(f"/api/projects/{PID}/memoire/sections/partie_c/ajout_2/refaire").status_code == 404
    assert client.post(f"/api/projects/{PID}/memoire/sections/partie_a/ajout_1/refaire").status_code == 404
    assert client.post(f"/api/projects/{PID}/memoire/sections/partie_c/zzz/refaire").status_code == 404


def test_refaire_reprend_la_fiche_du_plan_valide(client, db_session, test_org, monkeypatch):
    _projet(db_session, test_org.id, plan=_plan_stocke())
    appels = _faux_refaire(monkeypatch)
    assert client.post(f"/api/projects/{PID}/memoire/sections/partie_b/dechets/refaire").status_code == 200
    _joindre()
    p = appels[0][2]["plan_partie"]
    assert p["voulu"] == "Insister sur le tri." and any("ITE d'une école" in l for l in p["lignes"])


def test_refaire_sans_plan_comme_avant(client, db_session, test_org, monkeypatch):
    _projet(db_session, test_org.id)
    appels = _faux_refaire(monkeypatch)
    assert client.post(f"/api/projects/{PID}/memoire/sections/partie_b/dechets/refaire").status_code == 200
    _joindre()
    assert appels[0][2]["plan_partie"] is None


def test_l_enregistrement_de_l_editeur_ne_remplace_jamais_le_plan_suivi(client, db_session, test_org):
    _projet(db_session, test_org.id)
    corps = json.loads(json.dumps(CONTENU))
    corps["partie_a"]["historique"] = "Texte retouché."
    corps["_plan"] = {"parties": [{"partie": "partie_a", "sous_cle": "historique", "titre": "Titre piégé"}]}
    r = client.patch(f"/api/projects/{PID}/memoire", json={"content_json": corps})
    assert r.status_code == 200, r.text
    db_session.expire_all()
    c = db_session.query(MemoireTechnique).first().content_json
    assert c["partie_a"]["historique"] == "Texte retouché." and c["_plan"] == PLAN_SUIVI
    # mémoire sans plan suivi : un plan envoyé est ignoré
    mem = db_session.query(MemoireTechnique).first()
    sans = {k: v for k, v in mem.content_json.items() if k != "_plan"}
    mem.content_json = sans
    db_session.commit()
    client.patch(f"/api/projects/{PID}/memoire", json={"content_json": {**corps}})
    db_session.expire_all()
    assert "_plan" not in db_session.query(MemoireTechnique).first().content_json


# ── Le job de rédaction : le plan validé part au générateur, sinon rien ──────

def _lancer_la_generation(client, monkeypatch):
    import routers.memoire as memoire_mod
    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)
    recus = {}

    async def _capture(self, **kwargs):
        recus.update(kwargs)
        return {"preambule": "ok", "partie_a": {"historique": "ok"}, "partie_b": {}, "partie_c": {}}

    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _capture)
    r = client.post(f"/api/projects/{PID}/memoire/generate", json={})
    assert r.status_code == 200, r.text
    for t in threading.enumerate():
        if t.name.startswith("synorix-memoire-"):
            t.join(timeout=30)
    return recus


def test_le_job_passe_le_plan_valide_au_generateur(client, db_session, test_org, monkeypatch):
    _projet(db_session, test_org.id, plan=_plan_stocke())
    db_session.query(MemoireTechnique).delete()
    db_session.commit()
    recus = _lancer_la_generation(client, monkeypatch)
    assert recus["plan"] is not None
    assert [p["sous_cle"] for p in recus["plan"] if p["partie"] == "partie_c"][-1] == "ajout_1"
    assert any(p["titre"] == "Gestion des déchets de chantier" for p in recus["plan"])


def test_le_job_sans_plan_valide_n_envoie_aucun_plan(client, db_session, test_org, monkeypatch):
    _projet(db_session, test_org.id, plan=_plan_stocke(), valide=False)
    db_session.query(MemoireTechnique).delete()
    db_session.commit()
    assert _lancer_la_generation(client, monkeypatch)["plan"] is None
