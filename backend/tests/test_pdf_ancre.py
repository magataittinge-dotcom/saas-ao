"""A2 (sujet A) — recherche du passage cité et règles d'honnêteté
(``services/pdf_ancre.py``). Textes inventés : aucun texte de DCE dans le dépôt."""
import pytest

from services import pdf_ancre as anc
from services import pdf_positions as pp
from services.pdf_lecture import PdfIllisible
from tests.pdf_fabrique import pdf_regle, pdf_texte, pdf_texte_masque

PASSAGE = "Les menuiseries extérieures seront livrées avec leurs vitrages feuilletés."


def _ancre(octets, page_ia, extrait, doc_id="doc-1"):
    with pp.ouvrir(octets) as pdf:
        return anc.construire_ancre(pdf, doc_id, page_ia, extrait)


def _pages(*textes):
    return pdf_texte(list(textes))


# ─── le passage entier, sur sa page ───────────────────────────────────────────

def test_passage_trouve_sur_la_page_donnee_avec_rectangles_et_citation():
    octets = _pages("Article 3 — Fournitures\n" + PASSAGE + "\nLa pose suit la livraison.")
    ancre = _ancre(octets, 1, PASSAGE)
    assert ancre["niveau"] == "passage" and ancre["page"] == 1 and ancre["rotation"] == 0
    assert ancre["version"] == 1 and ancre["doc_id"] == "doc-1"
    assert len(ancre["rects"]) >= 1 and all(0 <= v <= 1 for r in ancre["rects"] for v in r)
    assert ancre["citation"]["passage"] == PASSAGE
    assert "suite" not in ancre


def test_insensible_aux_accents_a_la_casse_a_la_ponctuation_et_aux_blancs():
    octets = _pages("Le candidat remet l’acte d’engagement (AE) signé, avec son Kbis.")
    ancre = _ancre(octets, 1, "LE CANDIDAT REMET L'ACTE D ENGAGEMENT AE SIGNE avec son kbis")
    assert ancre["niveau"] == "passage"
    # l'extrait n'a pas de point final : la citation n'en ajoute pas
    assert ancre["citation"]["passage"] == "Le candidat remet l’acte d’engagement (AE) signé, avec son Kbis"


def test_ponctuation_de_bord_incluse_dans_la_citation_et_les_rectangles():
    octets = _pages("Joindre l’acte d’engagement (AE) daté et signé.")
    avec = _ancre(octets, 1, "acte d’engagement (AE)")
    sans = _ancre(octets, 1, "acte d’engagement")
    assert avec["citation"]["passage"] == "acte d’engagement (AE)"
    assert sans["citation"]["passage"] == "acte d’engagement"
    assert avec["rects"][0][2] > sans["rects"][0][2]


def test_un_passage_sur_plusieurs_lignes_a_un_rectangle_par_ligne():
    texte = "Première ligne du passage cité\nDeuxième ligne du passage cité\nTroisième ligne ici"
    octets = pdf_texte([texte], largeur_car=None)
    ancre = _ancre(octets, 1, "du passage cité Deuxième ligne du passage cité Troisième")
    assert ancre["niveau"] == "passage" and len(ancre["rects"]) == 3


def test_cesure_de_fin_de_ligne_recollee():
    octets = pdf_texte(["Le panneau celui-\nci sera posé en fond de joint."], largeur_car=None)
    ancre = _ancre(octets, 1, "celui-ci sera posé")
    assert ancre["niveau"] == "passage" and len(ancre["rects"]) == 2
    assert ancre["citation"]["passage"] == "celui-ci sera posé"


# ─── la page de l'IA est fausse ───────────────────────────────────────────────

def test_page_voisine_trouvee_et_la_bonne_page_est_enregistree():
    octets = _pages("Page un, sans rapport.", "Page deux, sans rapport.", PASSAGE, "Page quatre.")
    assert _ancre(octets, 2, PASSAGE)["page"] == 3       # l'IA a cité la page 2
    assert _ancre(octets, 4, PASSAGE)["page"] == 3       # ou la page 4


def test_page_lointaine_passage_unique_dans_le_document_retrouve():
    octets = _pages("Un.", "Deux.", "Trois.", "Quatre.", PASSAGE, "Six.")
    ancre = _ancre(octets, 1, PASSAGE)
    assert ancre["niveau"] == "passage" and ancre["page"] == 5


def test_page_hors_du_document_passage_unique_retrouve():
    octets = _pages("Un.", PASSAGE)
    assert _ancre(octets, 105, PASSAGE)["page"] == 2


def test_passage_present_a_plusieurs_endroits_lointains_jamais_devine():
    octets = _pages("Un.", "Deux.", "Trois.", PASSAGE, "Cinq.", PASSAGE)
    ancre = _ancre(octets, 1, PASSAGE)
    assert ancre["niveau"] == "page" and ancre["page"] == 1 and ancre["rects"] == []
    assert ancre["citation"] is None
    assert _ancre(octets, 999, PASSAGE) is None          # ni page valable ni passage unique


def test_passage_sur_la_page_donnee_meme_repete_ailleurs():
    octets = _pages("Un.", PASSAGE, "Trois.", "Quatre.", PASSAGE)
    ancre = _ancre(octets, 5, PASSAGE)
    assert ancre["niveau"] == "passage" and ancre["page"] == 5


# ─── à cheval sur deux pages ──────────────────────────────────────────────────

def test_passage_a_cheval_sur_deux_pages():
    octets = _pages("Début de la page.\nLes menuiseries extérieures seront livrées",
                    "avec leurs vitrages feuilletés.\nSuite de la page.")
    ancre = _ancre(octets, 1, PASSAGE)
    assert ancre["niveau"] == "passage" and ancre["page"] == 1
    assert len(ancre["rects"]) >= 1
    assert ancre["suite"]["page"] == 2 and len(ancre["suite"]["rects"]) >= 1
    assert ancre["suite"]["rects"][0][1] < ancre["rects"][0][1] + 0.05   # en haut de la page 2
    assert ancre["citation"]["passage"] == PASSAGE


def test_page_citee_la_seconde_du_cheval_est_retrouvee_par_la_precedente():
    octets = _pages("Début.\nLes menuiseries extérieures seront livrées",
                    "avec leurs vitrages feuilletés.\nSuite.")
    assert _ancre(octets, 2, PASSAGE)["page"] == 1


# ─── un mot isolé ─────────────────────────────────────────────────────────────

def test_mot_isole_surligne_sur_la_page_donnee_une_a_trois_fois():
    octets = _pages("Le candidat fournit son Kbis. Le Kbis date de moins de 3 mois.", "Autre page.")
    ancre = _ancre(octets, 1, "Kbis")
    assert ancre["niveau"] == "passage" and len(ancre["rects"]) == 2
    assert ancre["citation"]["passage"] == "Kbis"


def test_mot_isole_ni_ailleurs_ni_trop_souvent_ni_en_morceau_de_mot():
    octets = _pages("Kbis. Kbis. Kbis. Kbis.", "Le Kbis est joint.", "Les kbisx ne comptent pas.")
    quatre = _ancre(octets, 1, "Kbis")
    assert quatre["niveau"] == "page" and quatre["page"] == 1 and quatre["rects"] == []
    ailleurs = _ancre(octets, 3, "Kbis")             # page 3 : « kbisx » n'est pas le mot
    assert ailleurs["niveau"] == "page" and ailleurs["page"] == 3
    assert _ancre(octets, 77, "Kbis") is None


def test_trop_court_jamais_surligne():
    octets = _pages("Le sigle AE figure ici.")
    ancre = _ancre(octets, 1, "AE")
    assert ancre["niveau"] == "page" and ancre["rects"] == []


# ─── introuvable, masqué, tourné ──────────────────────────────────────────────

def test_extrait_introuvable_niveau_page_ou_rien():
    octets = _pages("Un texte sans rapport avec la demande.")
    ancre = _ancre(octets, 1, PASSAGE)
    assert ancre["niveau"] == "page" and ancre["page"] == 1 and ancre["rects"] == []
    assert _ancre(octets, None, PASSAGE) is None
    assert _ancre(octets, 1, "") ["niveau"] == "page"
    assert _ancre(octets, 1, None)["niveau"] == "page"


def test_texte_masque_jamais_trouve():
    octets = pdf_texte_masque("Texte visible du haut", "Mention cachée du bas de page")
    ancre = _ancre(octets, 1, "Mention cachée du bas de page")
    assert ancre["niveau"] == "page" and ancre["rects"] == []
    assert _ancre(octets, 1, "Texte visible du haut")["niveau"] == "passage"


def test_page_tournee_rotation_dans_l_ancre():
    octets = pdf_regle(_pages(PASSAGE), rotation=90)
    ancre = _ancre(octets, 1, PASSAGE)
    assert ancre["rotation"] == 90 and ancre["niveau"] == "passage"
    assert _ancre(octets, 1, "rien du tout dans ce plan")["rotation"] == 90


# ─── citation : paragraphe, en-tête, après ────────────────────────────────────

def test_citation_avant_coupe_au_paragraphe_sans_entete_ni_paragraphe_precedent():
    octets = _pages("CCTP LOT 03 — MENUISERIES\n"
                    "Fin du paragraphe précédent, sans rapport.\n"
                    "Le titulaire prévoit que les menuiseries extérieures seront livrées avec leurs\n"
                    "vitrages feuilletés. Les joints sont posés ensuite.\nAutre phrase plus loin.")
    ancre = _ancre(octets, 1, "menuiseries extérieures seront livrées avec leurs vitrages feuilletés.")
    assert ancre["citation"]["passage"] == "menuiseries extérieures seront livrées avec leurs vitrages feuilletés."
    assert ancre["citation"]["avant"] == "Le titulaire prévoit que les"
    assert ancre["citation"]["apres"] == "Les joints sont posés ensuite."


def test_citation_en_haut_de_page_sans_l_entete():
    octets = _pages("CCTP LOT 03 — MENUISERIES\n" + PASSAGE)
    ancre = _ancre(octets, 1, PASSAGE)
    assert ancre["citation"]["avant"] == ""
    assert "CCTP" not in ancre["citation"]["avant"]


def test_citation_longue_coupee_a_un_mot_entier():
    ligne = " ".join(f"mot{i}" for i in range(120))
    octets = _pages(ligne + " " + PASSAGE)
    avant = _ancre(octets, 1, PASSAGE)["citation"]["avant"]
    assert 0 < len(avant) <= 300 and avant.startswith("mot")
    assert avant.endswith("mot119")


# ─── calculer_ancres : une ouverture par pièce ────────────────────────────────

def test_calculer_ancres_une_ouverture_et_une_erreur_n_arrete_pas_les_autres(monkeypatch):
    octets = _pages("Un.", PASSAGE)
    reel = anc.construire_ancre

    def fragile(pdf, doc_id, page, extrait):
        if extrait == "boum":
            raise RuntimeError("boum")
        return reel(pdf, doc_id, page, extrait)

    monkeypatch.setattr(anc, "construire_ancre", fragile)
    ouvertures = []
    vrai_ouvrir = pp.ouvrir
    monkeypatch.setattr(pp, "ouvrir", lambda s: ouvertures.append(1) or vrai_ouvrir(s))
    res = anc.calculer_ancres(octets, "d", [
        {"id": "a", "page": 2, "extrait": PASSAGE},
        {"id": "b", "page": 1, "extrait": "boum"},
        {"id": "c", "page": 1, "extrait": PASSAGE},
    ])
    assert len(ouvertures) == 1
    assert res["a"]["page"] == 2 and res["c"]["page"] == 2 and res["b"] is None


def test_calculer_ancres_pdf_illisible_leve_et_chemin_absent_aussi(tmp_path):
    with pytest.raises(PdfIllisible):
        anc.calculer_ancres(b"ceci n'est pas un pdf", "d", [{"id": "a", "page": 1, "extrait": PASSAGE}])
    with pytest.raises(OSError):
        anc.calculer_ancres(str(tmp_path / "absent.pdf"), "d", [])


def test_calculer_ancres_depuis_un_chemin(tmp_path):
    chemin = tmp_path / "cctp.pdf"
    chemin.write_bytes(_pages(PASSAGE))
    res = anc.calculer_ancres(str(chemin), "d", [{"id": "x", "page": 1, "extrait": PASSAGE}])
    assert res["x"]["niveau"] == "passage"
