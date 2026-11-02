"""« Relire mon mémoire » (phase F) : contrôle déterministe, sans IA. Chaînes inventées (jamais de texte de DCE)."""
import pytest

from models.checklist_item import ChecklistItem
from models.memoire import MemoireTechnique
from models.organization import Organization
from models.project import Project
from models.user import User
from services.relecture_memoire import (
    A_CITER, A_COMPLETER, A_COUVRIR, A_RESSERRER, HORS_LISTE, MESSAGE_RAS,
    limite_de_pages, mots_significatifs, relire_memoire, sections_du_memoire,
)

CRITERES = [
    {"nom": "Valeur technique", "poids": 60, "sous_criteres": [
        {"nom": "Moyens humains et matériels affectés au chantier", "poids": 30},
        {"nom": "Méthodologie d'exécution", "poids": 20},
        {"nom": "Gestion des déchets", "poids": 10},
    ]},
    {"nom": "Prix", "poids": 40},      # sans sous-critère : rien à contrôler
]


def memoire(**sections):
    contenu = {"preambule": "Présentation de l'offre.", "partie_a": {}, "partie_b": {}, "partie_c": {}}
    for cle, texte in sections.items():
        partie = "partie_a" if cle in ("implantation", "organigramme", "references", "historique") else (
            "partie_b" if cle in ("respect_planning", "dechets", "securite") else "partie_c")
        contenu[partie][cle] = texte
    return contenu


def types(r):
    return [(l["type"], l["libelle"]) for l in r.lignes]


# ── normalisation ─────────────────────────────────────────────────────────────

def test_mots_significatifs_accents_casse_pluriels_mots_vides():
    assert mots_significatifs("Les Moyens HUMAINS, et matériels !") == ["moyen", "humain", "materiel"]
    assert mots_significatifs("Gestion des déchets") == mots_significatifs("gestion du déchet")


# ── 1. sous-critères ──────────────────────────────────────────────────────────

def test_sous_criteres_nommes_aucune_ligne():
    c = memoire(
        implantation="Nos moyens humains et matériels affectés au chantier sont décrits ici.",
        methodologie="La méthodologie d'exécution suit trois phases.",
        dechets="Notre gestion des déchets repose sur le tri.",
    )
    assert relire_memoire(c, criteres=CRITERES).lignes == []


def test_sous_critere_a_couvrir_avec_section_et_source():
    c = memoire(methodologie="La méthodologie d'exécution suit trois phases.",
                dechets="Les déchets sont triés.")
    source = {"type": "champ", "document": "RC.pdf", "page": 7, "excerpt": "Critères"}
    r = relire_memoire(c, criteres=CRITERES, source_criteres=source)
    assert types(r) == [(("sous_critere"), A_COUVRIR)] * 2
    humains = r.lignes[0]
    assert humains["texte"] == "Moyens humains et matériels affectés au chantier"
    assert humains["detail"] == "Valeur technique"
    assert humains["source"] == source and humains["ancre"]
    # « Gestion des déchets » : les mots sont dans deux phrases de la même section mais pas dans un même paragraphe
    assert r.lignes[1]["texte"] == "Gestion des déchets"
    assert r.lignes[1]["ancre"] == "sec-dechets"          # la section la plus proche
    assert r.lignes[1]["section"].startswith("Partie B")


def test_sous_critere_les_mots_dans_un_meme_paragraphe_seulement():
    c = memoire(dechets="Moyens humains.\nMoyens matériels affectés au chantier.")
    r = relire_memoire(c, criteres=[{"nom": "X", "sous_criteres": [{"nom": "Moyens humains et matériels"}]}])
    assert len(r.lignes) == 1


def test_criteres_sans_sous_criteres_ou_vides():
    assert relire_memoire(memoire(), criteres=None).lignes == []
    assert relire_memoire(memoire(), criteres=[{"nom": "Prix"}]).lignes == []
    assert relire_memoire(memoire(), criteres=[{"nom": "A", "sous_criteres": [{"nom": "et de la"}]}]).lignes == []


# ── 2. pièces de l'offre technique ────────────────────────────────────────────

def test_pieces_techniques_citees_ou_a_citer():
    pieces = [
        {"type": "planning", "source": {"type": "exigence", "id": "e1"}},
        {"type": "organigramme_doc", "source": None},
        {"type": "kbis", "source": None},           # administrative : jamais à citer
    ]
    r = relire_memoire(memoire(organigramme="L'organigramme de l'entreprise est le suivant."), pieces=pieces)
    assert types(r) == [("piece", A_CITER)]
    assert r.lignes[0]["texte"] == "Planning prévisionnel"
    assert r.lignes[0]["ancre"] == "sec-respect_planning"
    assert r.lignes[0]["source"] == {"type": "exigence", "id": "e1"}


# ── 3. À compléter ────────────────────────────────────────────────────────────

def test_a_completer_compte_par_section_comme_l_export():
    from services.docx_exporter import compter_passages_a_completer

    c = memoire(historique="Fondée en [À COMPLÉTER : année de création]. Gérant : [À COMPLÉTER : nom].",
                securite="RAS [A COMPLETER]")
    c["preambule"] = "Texte sans trou."
    r = relire_memoire(c)
    assert [(l["ancre"], l["nombre"]) for l in r.lignes] == [("sec-historique", 2), ("sec-securite", 1)]
    assert all(l["libelle"] == A_COMPLETER for l in r.lignes)
    assert "année de création" in r.lignes[0]["texte"]
    assert sum(l["nombre"] for l in r.lignes) == compter_passages_a_completer(c)


def test_a_completer_raison_sociale_de_la_page_de_garde():
    r = relire_memoire(memoire(), raison_sociale_vide=True)
    assert types(r) == [("a_completer", A_COMPLETER)]
    assert r.lignes[0]["nombre"] == 1 and r.lignes[0]["lien"].startswith("/company")


# ── 4. DTU ────────────────────────────────────────────────────────────────────

def test_dtu_hors_liste():
    c = memoire(methodologie="Mise en œuvre selon le NF DTU 52.2 et le NF DTU 20.1.")
    r = relire_memoire(c, dtu_autorises={"20.1"})
    assert types(r) == [("dtu", HORS_LISTE)]
    assert r.lignes[0]["texte"] == "DTU 52.2"
    assert relire_memoire(c, dtu_autorises={"20.1", "52.2"}).lignes == []


# ── 5. longueur ───────────────────────────────────────────────────────────────

def test_limite_de_pages_lue_dans_les_exigences_ou_absente():
    ex = [{"texte": "Le mémoire technique ne devra pas dépasser 20 pages.", "source": {"type": "exigence", "id": "e9"}}]
    assert limite_de_pages(ex) == {"pages": 20, "source": {"type": "exigence", "id": "e9"}}
    assert limite_de_pages([{"texte": "Les pages sont numérotées.", "source": None}]) is None
    assert limite_de_pages([{"texte": "Délai maximum de 20 pages de paiement", "source": None}]) is None   # pas le mémoire


def test_longueur_trop_grande_seulement_si_limite_relevee():
    long = " ".join(["mot"] * 5200)            # ~10 pages
    c = memoire(methodologie=long)
    sans = relire_memoire(c)
    assert sans.lignes == [] and sans.limite_pages is None
    ex = [{"texte": "Le mémoire technique est limité à 6 pages maximum.", "source": {"type": "exigence", "id": "e9"}}]
    r = relire_memoire(c, exigences=ex)
    assert types(r) == [("longueur", A_RESSERRER)]
    assert r.lignes[0]["source"] == {"type": "exigence", "id": "e9"} and r.limite_pages == 6
    ok = relire_memoire(c, exigences=[{"texte": "Le mémoire ne doit pas dépasser 30 pages.", "source": None}])
    assert ok.lignes == []


# ── Tout va bien / vocabulaire ────────────────────────────────────────────────

def test_tout_va_bien_une_phrase_sobre_et_jamais_de_mot_negatif():
    d = relire_memoire(memoire()).en_dict()
    assert d["nombre"] == 0 and d["message"] == MESSAGE_RAS
    texte = (MESSAGE_RAS + A_COUVRIR + A_CITER + A_COMPLETER + HORS_LISTE + A_RESSERRER).lower()
    for mot in ("manquant", "incomplet", "absent", "!"):
        assert mot not in texte
    assert sections_du_memoire({"preambule": " ", "partie_a": {"historique": ""}}) == []


# ── Route : ownership, cross-org, aucun appel au modèle ───────────────────────

def _projet(db, org_id, pid, criteres=None, memoire_json=None):
    db.add(Project(id=pid, organization_id=org_id, name="Projet inventé", criteres_jugement=criteres))
    if memoire_json is not None:
        db.add(MemoireTechnique(project_id=pid, content_json=memoire_json))
    db.commit()


def test_route_relecture_sans_aucun_appel_au_modele(client, db_session, test_org, monkeypatch):
    import anthropic

    def interdit(*a, **k):
        raise AssertionError("la relecture ne doit jamais appeler le modèle")
    # tout client Anthropic qu'on tenterait de construire fait échouer le test
    monkeypatch.setattr(anthropic, "Anthropic", interdit)
    monkeypatch.setattr(anthropic, "AsyncAnthropic", interdit)

    _projet(db_session, test_org.id, "p-rel", CRITERES, memoire(
        methodologie="Voir le NF DTU 52.2. [À COMPLÉTER : nom du chef de chantier]"))
    db_session.add(ChecklistItem(project_id="p-rel", document_type_required="planning", document_group="synorix",
                                 source_document="RC.pdf", source_page=4, source_in_rc="Planning détaillé"))
    db_session.commit()
    r = client.get("/api/projects/p-rel/memoire/relecture")
    assert r.status_code == 200, r.text
    d = r.json()
    par_type = {}
    for l in d["lignes"]:
        par_type[l["type"]] = par_type.get(l["type"], 0) + 1
    assert par_type == {"sous_critere": 3, "piece": 1, "a_completer": 1, "dtu": 1}
    piece = next(l for l in d["lignes"] if l["type"] == "piece")
    assert piece["source"] == {"type": "champ", "document": "RC.pdf", "page": 4, "excerpt": "Planning détaillé"}
    # la raison sociale de l'organisation de test est renseignée : seul le passage du texte est compté
    assert sum(l["nombre"] for l in d["lignes"] if l["type"] == "a_completer") == 1
    assert d["message"] is None


def test_route_relecture_404_sans_memoire(client, db_session, test_org):
    _projet(db_session, test_org.id, "p-sans")
    assert client.get("/api/projects/p-sans/memoire/relecture").status_code == 404


def test_route_relecture_cross_org(client, db_session, test_org):
    db_session.add(Organization(id="org-autre-rel", name="Autre"))
    db_session.commit()
    _projet(db_session, "org-autre-rel", "p-autre-rel", None, memoire())
    assert client.get("/api/projects/p-autre-rel/memoire/relecture").status_code == 404


def test_les_ancres_du_serveur_sont_les_cles_de_l_ecran_du_memoire():
    """Chaque `sec-<clé>` rendue par le service existe dans lib/memoireSections.ts (la liste de l'écran)."""
    import re
    from pathlib import Path
    from services.relecture_memoire import _TITRES

    ts = (Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "memoireSections.ts").read_text(encoding="utf-8")
    cles_ecran = set(re.findall(r"cle: '([a-z_]+)'", ts))
    cles_serveur = {a.removeprefix("sec-") for a in _TITRES if a.startswith("sec-")}
    assert cles_serveur == cles_ecran
