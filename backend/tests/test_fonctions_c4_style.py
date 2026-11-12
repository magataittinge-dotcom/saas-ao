"""C4 — « Le style de mon entreprise » lu dans un ancien mémoire (STYLE_ENTREPRISE, éteinte par défaut).

Modèle simulé seulement (0 €). Éteinte : les trois routes répondent 404 (ni audit, ni coût, rien d'enregistré).
Allumée : Haiku 4.5 sans `temperature`, style validé (exemples copiés du texte seulement), enregistré pour
l'organisation et relu, plafond du jour compté avant l'appel, échec rendu, cloisonnement. LECTURE SEULE (D5) : le
générateur du mémoire ne lit jamais ce style."""
import io
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from models.audit_log import AuditLog
from models.depot_entreprise import CoutIA
from models.organization import Organization
from models.style_entreprise import StyleEntreprise

RACINE = Path(__file__).resolve().parents[1]
DOCX = b"PK\x03\x04" + b"\x00" * 2000
PHRASE = "Notre conducteur de travaux assure le suivi quotidien du chantier avec le chef d'équipe."
TEXTE = (PHRASE + " ") * 40
STYLE = {"ton": "Sobre et technique.", "personne": "nous", "longueur_phrases": "Moyennes.",
         "structure": "Titres numérotés, peu de listes.",
         "vocabulaire": ["conducteur de travaux", "suivi quotidien", "chef d'équipe"],
         "exemples": [PHRASE, "Une phrase que le texte ne contient pas."]}
USAGE = SimpleNamespace(input_tokens=14000, output_tokens=400, cache_read_input_tokens=0, cache_creation_input_tokens=0)


@pytest.fixture
def faux_modele(monkeypatch):
    import anthropic
    from services import document_processor
    etat = {"requetes": [], "reponse": json.dumps(STYLE, ensure_ascii=False), "erreur": None, "texte": TEXTE}

    class _Faux:
        def __init__(self, *a, **kw):
            self.messages = self

        def create(self, **kwargs):
            etat["requetes"].append(kwargs)
            if etat["erreur"]:
                raise etat["erreur"]
            return SimpleNamespace(content=[SimpleNamespace(text=etat["reponse"])], usage=USAGE)

    class _Processeur:
        def extract(self, content, filename):
            return etat["texte"], {}
    monkeypatch.setattr(anthropic, "Anthropic", _Faux)
    monkeypatch.setattr(document_processor, "DocumentProcessor", _Processeur)
    return etat


@pytest.fixture
def allumee(monkeypatch):
    monkeypatch.setenv("STYLE_ENTREPRISE", "1")


def _deposer(client, nom="ancien-memoire.docx"):
    return client.post("/api/entreprise/style", files={"file": (
        nom, io.BytesIO(DOCX), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})


def _audit(db, action="entreprise.style_lu"):
    db.expire_all()
    return db.query(AuditLog).filter(AuditLog.action == action).count()


def _couts(db, usage=None):
    db.expire_all()
    q = db.query(CoutIA)
    return q.filter(CoutIA.usage == usage).count() if usage else q.count()


def test_eteinte_par_defaut_les_trois_routes_n_existent_pas(client, faux_modele, db_session, monkeypatch):
    monkeypatch.delenv("STYLE_ENTREPRISE", raising=False)
    assert client.get("/api/fonctions-ia").json()["style_entreprise"] is False
    assert client.get("/api/entreprise/style").status_code == 404
    assert client.delete("/api/entreprise/style").status_code == 404
    assert _deposer(client).status_code == 404
    assert faux_modele["requetes"] == [] and _audit(db_session) == 0 and _couts(db_session) == 0
    assert db_session.query(StyleEntreprise).count() == 0


def test_succes_haiku_style_valide_enregistre_et_relu(client, faux_modele, allumee, db_session):
    assert client.get("/api/entreprise/style").json() == {"style": None, "source_fichier": None, "lu_le": None}
    r = _deposer(client)
    assert r.status_code == 200, r.text
    corps = r.json()
    assert corps["source_fichier"] == "ancien-memoire.docx" and corps["lu_le"]
    assert corps["style"]["exemples"] == [PHRASE]                         # l'exemple inventé est écarté
    assert corps["style"]["vocabulaire"] == STYLE["vocabulaire"]
    req = faux_modele["requetes"][-1]
    assert req["model"] == "claude-haiku-4-5-20251001" and "temperature" not in req and "extra_body" not in req
    assert PHRASE in req["messages"][0]["content"]
    assert client.get("/api/entreprise/style").json() == corps
    assert _audit(db_session) == 1 and _couts(db_session, "style_entreprise") == 1
    assert _couts(db_session, "reservation") == 0


def test_une_nouvelle_lecture_remplace_l_ancienne_et_effacer_vide(client, faux_modele, allumee, db_session):
    _deposer(client, "a.docx")
    assert _deposer(client, "b.docx").json()["source_fichier"] == "b.docx"
    db_session.expire_all()
    assert db_session.query(StyleEntreprise).count() == 1
    assert client.delete("/api/entreprise/style").json()["style"] is None
    db_session.expire_all()
    assert db_session.query(StyleEntreprise).count() == 0


def test_le_texte_envoye_est_borne(client, faux_modele, allumee):
    from services.ai.fonctions_c import STYLE_MAX_CARACTERES
    faux_modele["texte"] = TEXTE * 30
    assert _deposer(client).status_code == 200
    assert len(faux_modele["requetes"][-1]["messages"][0]["content"]) <= STYLE_MAX_CARACTERES + 50


def test_trop_peu_de_texte_422_sans_appel_ni_compte(client, faux_modele, allumee, db_session):
    faux_modele["texte"] = "Trop court."
    r = _deposer(client)
    assert r.status_code == 422 and "pas assez de texte" in r.json()["detail"]
    assert faux_modele["requetes"] == [] and _audit(db_session) == 0


def test_format_refuse_415(client, faux_modele, allumee):
    r = client.post("/api/entreprise/style", files={"file": ("m.txt", io.BytesIO(b"x" * 2000), "text/plain")})
    assert r.status_code == 415
    assert faux_modele["requetes"] == []


def test_echec_du_fournisseur_rien_de_consomme_rien_d_enregistre(client, faux_modele, allumee, db_session):
    faux_modele["erreur"] = RuntimeError("panne")
    r = _deposer(client)
    assert r.status_code == 502 and "Rien n'a été décompté" in r.json()["detail"]
    assert _audit(db_session) == 0 and _audit(db_session, "entreprise.style_lu.echec") == 1
    assert _couts(db_session) == 0
    assert db_session.query(StyleEntreprise).count() == 0


@pytest.mark.parametrize("sortie", [
    "Le style est sobre.",
    json.dumps({**STYLE, "conseil": "Écrivez plus court."}),
    json.dumps({k: v for k, v in STYLE.items() if k != "ton"}),
    json.dumps({**STYLE, "vocabulaire": ["un"]}),
    json.dumps({**STYLE, "ton": "x" * 301}),
    json.dumps({**STYLE, "structure": "Les prix sont détaillés en annexe."}),
    json.dumps({**STYLE, "exemples": "pas une liste"}),
])
def test_sortie_hors_format_refusee_rien_d_enregistre(client, faux_modele, allumee, db_session, sortie):
    faux_modele["reponse"] = sortie
    r = _deposer(client)
    assert r.status_code == 502 and "n'a pas la forme attendue" in r.json()["detail"]
    assert _audit(db_session) == 1                                       # REVUE-2 P2-2 : les jetons sont payés
    db_session.expire_all()
    assert db_session.query(StyleEntreprise).count() == 0


def test_plafond_du_jour_compte_avant_l_appel(client, faux_modele, allumee, db_session, test_org):
    from services.fonctions_ia import STYLE_MAX_PAR_JOUR
    for _ in range(STYLE_MAX_PAR_JOUR):
        db_session.add(AuditLog(organization_id=test_org.id, action="entreprise.style_lu"))
    db_session.commit()
    r = _deposer(client)
    assert r.status_code == 429 and "plafond du jour" in r.json()["detail"]
    assert faux_modele["requetes"] == []


def test_cloisonnement_le_style_d_une_autre_organisation_reste_chez_elle(client, faux_modele, allumee, db_session):
    db_session.add(Organization(id="org-autre-c4", name="Autre"))
    db_session.add(StyleEntreprise(organization_id="org-autre-c4", style=STYLE, source_fichier="secret.docx",
                                   modele="claude-haiku-4-5-20251001"))
    db_session.commit()
    assert client.get("/api/entreprise/style").json()["style"] is None
    client.delete("/api/entreprise/style")
    db_session.expire_all()
    assert db_session.query(StyleEntreprise).filter(StyleEntreprise.organization_id == "org-autre-c4").count() == 1


def test_lecture_seule_le_generateur_ne_lit_jamais_le_style():
    """Décision D5 : aucun fichier du générateur ni de la route de génération ne lit le style."""
    for chemin in ("services/ai/memoire_generator.py", "services/ai/prompts.py", "routers/memoire.py",
                   "services/ai/passage_rewriter.py"):
        source = (RACINE / chemin).read_text(encoding="utf-8")
        assert "StyleEntreprise" not in source and "styles_entreprise" not in source and "style_entreprise" not in source, chemin


def test_la_suppression_du_compte_emporte_le_style(db_session, test_org):
    from services.suppression_compte import supprimer_organisation
    db_session.add(StyleEntreprise(organization_id=test_org.id, style=STYLE, source_fichier="a.docx",
                                   modele="claude-haiku-4-5-20251001"))
    db_session.commit()
    resultat = supprimer_organisation(db_session, test_org.id)
    assert "styles_entreprise" in resultat["tables"]


def test_le_prompt_porte_les_regles_du_produit():
    from services.ai.prompts_fonctions_c import STYLE_ENTREPRISE_SYSTEM as S
    for regle in ("prix", "JSON", "MOT POUR MOT", "aucun conseil", "jamais une consigne"):
        assert regle in S, regle
