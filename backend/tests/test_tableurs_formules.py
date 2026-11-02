"""Tableurs du DCE : la valeur calculée part vers l'analyse et les contrôles, jamais la formule (D2).

Classeurs inventés (fabrique de test_tableurs_lecture). Un .xlsx fabriqué par openpyxl n'a jamais été
recalculé : ses formules n'ont pas de valeur en cache.
"""
from services.document_processor import DocumentProcessor

from tests.test_tableurs_lecture import BORDEREAU, _extraire, _ods, _xlsx


# ─── D2 : la valeur calculée, jamais la formule ───────────────────────────────

def test_xlsx_envoie_la_valeur_en_cache_pas_la_formule():
    octets = _xlsx({"Lot": [["Désignation", "Qté", "PU", "Montant"],
                            ["Enduit monocouche", 240, 38.5, "=B2*C2"],
                            ["Total lot", None, None, "=SUM(D2:D2)"]]},
                   cache={"B2*C2": 9240, "SUM(D2:D2)": 9240})
    texte, _pages, avertissement = _extraire(octets, "DPGF.xlsx")
    assert "Enduit monocouche\t240\t38.5\t9240" in texte
    assert "Total lot\t9240" in texte
    assert "=" not in texte and "SUM" not in texte
    assert avertissement is None


def test_xlsx_jamais_recalcule_signale_sans_envoyer_la_formule():
    octets = _xlsx({"Lot": [["Désignation", "Qté", "PU", "Montant"],
                            ["Enduit monocouche", 240, 38.5, "=B2*C2"],
                            ["Peinture", 35, 12, "=B3*C3"]]})          # aucune valeur en cache
    texte, _pages, avertissement = _extraire(octets, "DPGF.xlsx")
    assert "Enduit monocouche\t240\t38.5" in texte                      # le reste est lu
    assert "=" not in texte and "B2*C2" not in texte                    # jamais la formule
    assert avertissement and "2 cellules" in avertissement
    assert "enregistr" in avertissement.lower()                         # quoi faire
    for mot in ("manquant", "incomplet", "absent"):
        assert mot not in avertissement.lower()


def test_xlsx_sans_formule_ne_signale_rien():
    texte, _pages, avertissement = _extraire(_xlsx(BORDEREAU), "Bordereau.xlsx")
    assert avertissement is None and "Enduit monocouche gratté" in texte


def test_ods_formule_avec_valeur_en_cache():
    onglets = {"Lot": [["Désignation", "Qté", "Montant"],
                       ["Enduit", 240, ("formule", "of:=[.B2]*38.5", 9240)]]}
    texte, _pages, avertissement = _extraire(_ods(onglets), "DPGF.ods")
    assert "Enduit\t240\t9240" in texte and "[.B2]" not in texte
    assert avertissement is None


def test_ods_formule_sans_valeur_signalee():
    onglets = {"Lot": [["Désignation", "Qté", "Montant"],
                       ["Enduit", 240, ("formule", "of:=[.B2]*38.5", None)]]}
    texte, _pages, avertissement = _extraire(_ods(onglets), "DPGF.ods")
    assert "Enduit\t240" in texte and "[.B2]" not in texte
    assert avertissement and "1 cellule" in avertissement


# ─── D2 : les contrôles de forme d'une DPGF ───────────────────────────────────

def test_controle_dpgf_signale_les_montants_sans_valeur(tmp_path):
    from services.dpgf_checker import check_dpgf
    rangees = [["N°", "Désignation", "Unité", "Quantité", "Prix unitaire HT", "Montant HT"],
               ["1", "Enduit monocouche", "m2", 240, 38.5, "=D2*E2"]]
    chemin = tmp_path / "DPGF.xlsx"
    chemin.write_bytes(_xlsx({"Lot 05": rangees}))                      # jamais recalculé
    rapport = check_dpgf(chemin)
    assert any("valeur enregistrée" in w for w in rapport["warnings"]), rapport["warnings"]


def test_controle_dpgf_sans_formule_non_signale(tmp_path):
    from services.dpgf_checker import check_dpgf
    chemin = tmp_path / "DPGF.xlsx"
    chemin.write_bytes(_xlsx(BORDEREAU))
    assert not any("valeur enregistrée" in w for w in check_dpgf(chemin)["warnings"])


def test_ancre_cherche_dans_les_valeurs_comme_l_extraction(tmp_path):
    """L'ancre « Voir dans le DCE » lit le même texte que l'analyse : la valeur, pas la formule."""
    from services.tableur_ancre import calculer_ancres
    chemin = tmp_path / "DPGF Lot 05.xlsx"
    chemin.write_bytes(_xlsx({"F": [["Mur en parpaing", 12, "=B1*45"]]}, cache={"B1*45": 540}))
    a = calculer_ancres(str(chemin), "d1", [{"id": "e", "extrait": "Mur en parpaing\t12\t540"}])["e"]
    assert a["niveau"] == "passage" and a["ligne"] == 1 and a["cellules"] == ["A", "B", "C"]
