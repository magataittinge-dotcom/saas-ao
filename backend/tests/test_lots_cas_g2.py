"""Les 32 cas de lots du banc G2 (nuit du 25/10), en tests — textes inventés.

Banc G2 sur l'ancien code : 6 cas conformes sur 32. Chaque cas : une entrée
réaliste, ce qu'on attend. Un cas encore à corriger est marqué
`xfail(strict=True)` avec sa raison : quand il est corrigé, la marque tombe dans
le même commit (un xfail strict qui passe fait échouer la suite).
Aucun appel IA : should_trigger dit seulement si le filet payant SERAIT déclenché.
"""
from types import SimpleNamespace

import openpyxl
import pytest

from services import document_tagger as DT
from services import lot_detector as LD
from services.ai import lot_fallback as LF

A_CORRIGER = pytest.mark.xfail(strict=True)


def ids(dets):
    return [d.id for d in dets]


# ─── RC : texte ──────────────────────────────────────────────────────────────

RC_VERTICAL = ("REGLEMENT DE LA CONSULTATION\nLOT\nINTITULE\n01\nTerrassements – VRD\n02\nMaçonnerie\n"
               "03\nÉtanchéité\n04\nSerrurerie\n")


def test_cas01_rc_tableau_vertical_temoin():
    assert ids(LD._detect_lots_from_rc_text(RC_VERTICAL, "rc")) == ["lot1", "lot2", "lot3", "lot4"]


def test_cas02_rc_vertical_description_du_lot_sans_les_lots_suivants():
    d = LD._detect_lots_from_rc_text(RC_VERTICAL, "rc")
    assert d and "02" not in d[0].description_long


def test_cas03_rc_vertical_intitule_sur_deux_lignes():
    rc = ("REGLEMENT DE LA CONSULTATION\nLOT\nINTITULE\n01\nTerrassements – VRD\n02\nCloisons – Doublages –\n"
          "Faux plafonds\n03\nÉtanchéité\n04\nSerrurerie\n05\nPeinture\n")
    d = LD._detect_lots_from_rc_text(rc, "rc")
    assert ids(d) == ["lot1", "lot2", "lot3", "lot4", "lot5"]
    assert d[1].nom == "Lot 02 — Cloisons – Doublages – Faux plafonds"


def test_cas04_rc_vertical_coupe_par_un_saut_de_page():
    rc = ("REGLEMENT DE LA CONSULTATION\nLOT\nINTITULE\n01\nTerrassements\n02\nMaçonnerie\n03\nÉtanchéité\n"
          "4417 – RC TRAVAUX\n5\n04\nSerrurerie\n05\nPeinture\n")
    d = LD._detect_lots_from_rc_text(rc, "rc")
    assert ids(d) == ["lot1", "lot2", "lot3", "lot4", "lot5"]


RC_SOMMAIRE = ("REGLEMENT DE LA CONSULTATION\nSOMMAIRE\n1\nOBJET DE LA CONSULTATION\n2\nCONDITIONS DE LA CONSULTATION\n"
               "3\nPRESENTATION DES OFFRES\n4\nJUGEMENT DES OFFRES\n"
               "Le marché est alloti en 2 lots :\nLot 1 : Maçonnerie\nLot 2 : Couverture\n")


def test_cas05_sommaire_du_rc_n_est_pas_un_tableau_de_lots():
    d = LD._detect_lots_from_rc_text(RC_SOMMAIRE, "rc")
    assert [x.nom for x in d] == ["Lot 1 — Maçonnerie", "Lot 2 — Couverture"]


def test_cas06_sommaire_puis_drop_ghosts():
    lots = [x.to_dict() for x in LD._detect_lots_from_rc_text(RC_SOMMAIRE, "rc")]
    annonce = LD.extract_announced_lot_count(RC_SOMMAIRE)
    assert [l["nom"] for l in LF.drop_ghosts(lots, annonce)] == ["Lot 1 — Maçonnerie", "Lot 2 — Couverture"]


RC_TRANCHES = ("REGLEMENT DE LA CONSULTATION\nLe marché n'est pas alloti. Il comporte une tranche ferme et deux "
               "tranches optionnelles.\nTranche 1 : rénovation du gymnase\nTranche 2 : création d'un préau\n")


def test_cas07_marche_non_alloti_a_tranches_aucun_lot():
    assert LD._detect_lots_from_rc_text(RC_TRANCHES, "rc") == []


def test_cas08_n_est_pas_alloti_ne_mentionne_pas_d_allotissement():
    assert LD.mentions_allotissement(RC_TRANCHES) is False


def test_cas09_non_alloti_sans_lot_pas_de_filet_ia_payant():
    mention = LD.mentions_allotissement("Le marché n'est pas alloti (lot unique).")
    assert LF.should_trigger([], None, mention)[0] is False


def test_cas10_sous_lots_7_1_et_7_2():
    rc = "REGLEMENT DE LA CONSULTATION\nLot 7.1 : Plomberie\nLot 7.2 : Ventilation\nLot 8 : Électricité\n"
    assert len(LD._detect_lots_from_rc_text(rc, "rc")) == 3


def test_cas11_lots_par_lettres():
    rc = "REGLEMENT DE LA CONSULTATION\nLot A – Terrassements\nLot B – Maçonnerie\nLot C – Couverture\n"
    assert len(LD._detect_lots_from_rc_text(rc, "rc")) == 3


def test_cas12_lots_sans_numero():
    rc = ("REGLEMENT DE LA CONSULTATION\nLe marché est alloti :\n- Lot Maçonnerie\n- Lot Couverture zinc\n"
          "- Lot Peinture\n")
    assert len(LD._detect_lots_from_rc_text(rc, "rc")) == 3


def test_cas13_deux_lots_sur_une_ligne():
    rc = ("REGLEMENT DE LA CONSULTATION\nLe marché comporte 3 lots.\nLots 1 et 2 : voir CCTP commun.\n"
          "Lot 3 et 4 : Menuiseries\n")
    assert not any("et 4" in x.nom for x in LD._detect_lots_from_rc_text(rc, "rc"))


def test_cas14_pse_rattachees_a_un_lot():
    rc = ("REGLEMENT DE LA CONSULTATION\nLot 2 – Maçonnerie\nPSE n°1 : enduit à la chaux\nLot 3 – Couverture\n"
          "PSE 2 – Lot 3 : chéneaux zinc\n")
    assert ids(LD._detect_lots_from_rc_text(rc, "rc")) == ["lot2", "lot3"]


# ─── Nombre de lots annoncé ──────────────────────────────────────────────────

def test_cas15_nombre_annonce_divisee_en_lots():
    assert LD.extract_announced_lot_count("La consultation est divisée en 9 lots.") == 9


def test_cas16_nombre_annonce_tranches_et_lots():
    assert LD.extract_announced_lot_count("Le marché comprend 2 tranches et 4 lots.") == 4


def test_cas17_nombre_annonce_lots_separes():
    assert LD.extract_announced_lot_count("Allotissement : 5 lots séparés") == 5


def test_cas18_nombre_annonce_decomposition_en_lots():
    assert LD.extract_announced_lot_count("Il est prévu une décomposition en lots : 6 lots.") == 6


# ─── Noms de fichiers ────────────────────────────────────────────────────────

def test_cas19_ilot_et_pilote_ne_sont_pas_des_lots():
    assert LD._detect_lots_from_filenames(["PLAN ILOT A.pdf", "ARCH PILOTE.pdf", "Notice îlot B.pdf"]) == []


# ─── Rattachement des pièces (document_tagger) ───────────────────────────────

@pytest.mark.parametrize("cas,nom,type_,attendu", [
    ("cas20", "CCTP Lot 10 Plomberie sanitaires.pdf", "cctp", ["10"]),
    ("cas21", "CCTP_Lot05_Facade_ITE.pdf", "cctp", ["5"]),
    ("cas22", "CCTP Lot 08 Portes coupe-feu.pdf", "cctp", ["8"]),
    ("cas23", "CCTP Lot 06 Plafonds acoustiques.pdf", "cctp", ["6"]),
    ("cas24", "CCTP Lot 11 Niveau 2 - Electricité.pdf", "cctp", ["11"]),
    ("cas25", "CCTP lot 00 Généralités.pdf", "cctp", ["all"]),
    pytest.param("cas26", "CCTP Lot 02 et 03 Menuiseries.pdf", "cctp", ["2", "3"]),
    ("cas27", "CCTP ilot 2 - lot 05 façades.pdf", "cctp", ["5"]),
    ("cas28", "Diagnostic plomb.pdf", "diagnostic", ["info"]),
    ("cas29", "PGC SPS.pdf", "pgc_sps", ["info"]),
])
def test_cas20_a_29_rattachement(cas, nom, type_, attendu):
    assert DT.assign_document_lots(nom, type_) == attendu


def test_cas30_sous_lot_01a_rattache_au_lot_01():
    nom = "DPGF Lot 01a GO.xlsx"
    docs = [SimpleNamespace(file_name=nom, related_lots=DT.assign_document_lots(nom, "dpgf_template"))]
    # Le RC ne définit que le lot 01 (décision du 25/10).
    assert [x.file_name for x in DT.get_documents_for_lot(docs, "lot1", ["lot1", "lot2"])] == [nom]


# ─── Classeurs (DPGF) ────────────────────────────────────────────────────────

@A_CORRIGER
def test_cas31_onglets_nommes_par_metier_sans_numero_invente(tmp_path):
    classeur = openpyxl.Workbook()
    classeur.active.title = "Page de garde"
    for nom in ("Electricité", "Plomberie", "Sécurité incendie", "Récapitulatif"):
        classeur.create_sheet(nom)["A1"] = "Désignation"
    chemin = tmp_path / "dpgf_onglets_metiers.xlsx"
    classeur.save(chemin)
    trouves = [x["id"] for x in LD.detect_lots_from_excel(str(chemin))]
    assert not any(i in ("lot5", "lot13") for i in trouves), trouves


@A_CORRIGER
def test_cas32_ferme_de_charpente_n_est_pas_une_tranche(tmp_path):
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    feuille.title = "Lot 03 Charpente"
    feuille["A1"] = "DPGF – Lot 03 Charpente bois"
    feuille["A3"] = "Fermes bois lamellé-collé"
    feuille["A4"] = "Ferme type F1 portée 12 m"
    chemin = tmp_path / "dpgf_charpente.xlsx"
    classeur.save(chemin)
    assert all(not x.get("tranches") for x in LD.detect_lots_from_excel(str(chemin)))


# ─── Bugs prioritaires (sprint Ozcan) ────────────────────────────────────────

def test_signature_a_paris_le_n_est_pas_le_lot_a():
    """« A Paris, le 12 mars » sous un tableau de lots : la lettre A de la
    préposition ne devient pas la ligne « lot A »."""
    rc = ("REGLEMENT DE LA CONSULTATION\nListe des lots\n2 Maçonnerie\n3 Couverture\n\n"
          "A Paris, le 12 mars 2026\nLe maître d'ouvrage\n")
    assert ids(LD._detect_lots_from_rc_text(rc, "rc")) == ["lot2", "lot3"]


def test_signature_a_paris_le_seule_sous_un_en_tete_de_lots():
    rc = "REGLEMENT DE LA CONSULTATION\nListe des lots\nA Paris, le 12 mars 2026\nLe maître d'ouvrage\n"
    assert LD._detect_lots_from_rc_text(rc, "rc") == []


def test_lots_par_lettres_en_tableau_restent_detectes():
    rc = "REGLEMENT DE LA CONSULTATION\nListe des lots\nA Terrassements\nB Maçonnerie\nC Couverture\n"
    assert [x.nom for x in LD._detect_lots_from_rc_text(rc, "rc")] == [
        "Lot A — Terrassements", "Lot B — Maçonnerie", "Lot C — Couverture"]


def _det(lot, nom, conf, sources):
    return LD.LotDetection(id=lot, nom=nom, confidence=conf, sources=list(sources))


def test_fusion_le_tableau_du_rc_prime_sur_une_phrase_plus_longue_du_ccap():
    """Le libellé du tableau du RC (rc_table) l'emporte sur une mention du CCAP
    plus longue : le plus long ne gagne plus."""
    rc = [_det("lot2", "Lot 2 — Maçonnerie", 90, ["rc_table", "rc_text"])]
    ccap = [_det("lot2", "Lot 2 — Maçonnerie et gros œuvre selon article 3", 80, ["rc_text"])]
    assert LD._merge_detections(ccap, rc)[0].nom == "Lot 2 — Maçonnerie"
    assert LD._merge_detections(rc, ccap)[0].nom == "Lot 2 — Maçonnerie"


def test_fusion_le_nom_de_l_onglet_prime_sur_le_texte_d_une_cellule():
    onglet = [_det("lot3", "Lot 3 — Charpente", 85, ["excel"])]
    cellule = [_det("lot3", "Lot 3 — Charpente bois lamellé-collé bordereau", 65, ["excel"])]
    assert LD._merge_detections(cellule, onglet)[0].nom == "Lot 3 — Charpente"


def test_fusion_nom_vide_ne_gagne_jamais_et_complete_un_nom_plus_court():
    nu = [_det("lot4", "Lot 4", 75, ["excel"])]
    nomme = [_det("lot4", "Lot 4 — Étanchéité", 55, ["filename"])]
    assert LD._merge_detections(nu, nomme)[0].nom == "Lot 4 — Étanchéité"


def test_fusion_a_confiance_egale_le_rc_prime_sur_le_ccap():
    """Deux tableaux (RC et CCAP) de même confiance : le RC est la référence."""
    rc = _det("lot5", "Lot 5 — Peinture", 90, ["rc_table", "rc_text"])
    rc.nom_confidence = 95   # posé par detect_all_lots pour une pièce de type RC
    ccap = _det("lot5", "Lot 5 — Peinture intérieure et extérieure", 90, ["rc_table", "rc_text"])
    assert LD._merge_detections([ccap], [rc])[0].nom == "Lot 5 — Peinture"


def test_rc_vertical_le_texte_apres_le_tableau_n_est_pas_colle_au_dernier_lot():
    rc = ("REGLEMENT DE LA CONSULTATION\nLOT\nINTITULE\n01\nTerrassements\n02\nMaçonnerie\n03\nPeinture –\n"
          "Les variantes ne sont pas autorisées.\nArticle 2\n")
    assert [x.nom for x in LD._detect_lots_from_rc_text(rc, "rc")][-1] == "Lot 03 — Peinture"


def test_allotissement_positif_et_negatif():
    assert LD.mentions_allotissement("Le marché est alloti en 9 lots.") is True
    assert LD.mentions_allotissement("Le marché n’est pas passé en lot unique : il est alloti.") is True
    assert LD.mentions_allotissement("Marché non alloti.") is False
    assert LD.mentions_allotissement("Le marché est passé sans allotissement.") is False


def test_une_tranche_mentionnee_avec_des_lots_ne_change_pas_les_lots():
    rc = "REGLEMENT DE LA CONSULTATION\nLot 1 : Maçonnerie (tranche ferme)\nLot 2 : Couverture\nTranche 3 : préau\n"
    assert ids(LD._detect_lots_from_rc_text(rc, "rc")) == ["lot1", "lot2"]


def test_sous_lots_ont_chacun_leur_identifiant():
    rc = "REGLEMENT DE LA CONSULTATION\nLot 7.1 : Plomberie\nLot 7.2 : Ventilation\nLot 8 : Électricité\n"
    d = LD._detect_lots_from_rc_text(rc, "rc")
    assert ids(d) == ["lot7a", "lot7b", "lot8"]
    assert [x.nom for x in d][:2] == ["Lot 7.1 — Plomberie", "Lot 7.2 — Ventilation"]


def test_deux_lots_sur_une_ligne_portent_la_meme_designation():
    rc = "REGLEMENT DE LA CONSULTATION\nLot 3 et 4 : Menuiseries\nLot 5 : Peinture\n"
    d = LD._detect_lots_from_rc_text(rc, "rc")
    assert [(x.id, x.nom) for x in d] == [("lot3", "Lot 3 — Menuiseries"), ("lot4", "Lot 4 — Menuiseries"),
                                          ("lot5", "Lot 5 — Peinture")]


def test_un_lot_cite_dans_une_phrase_sans_numero_n_est_pas_une_liste():
    rc = "REGLEMENT DE LA CONSULTATION\nLe lot Maçonnerie est réalisé en entreprise.\nLot unique\n"
    assert LD._detect_lots_from_rc_text(rc, "rc") == []


def test_fichier_sous_lot_et_deux_lots_dans_le_nom():
    assert DT.assign_document_lots("DPGF Lot 7.1 Plomberie.xlsx", "dpgf_template") == ["7a"]
    assert DT.assign_document_lots("CCTP Lot 5 & 6.pdf", "cctp") == ["5", "6"]
    assert DT.assign_document_lots("CCTP Lot 5 et 12 pièces.pdf", "cctp") == ["5", "12"]
