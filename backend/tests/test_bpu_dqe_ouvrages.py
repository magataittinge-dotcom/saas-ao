"""BPU et DQE de l'acheteur : même traitement que la DPGF (décision du 25/10).

Seulement la liste des ouvrages (désignation, unité, quantité de l'acheteur s'il
y en a une), jamais un prix, plafonnée. Avant : seule la DPGF (ou un tableur sans
type) fournissait la liste ; un marché à prix unitaires n'en avait aucune.
"""
import io

import openpyxl
import pytest

from services import dpgf_ouvrages as dpgf

BPU = [["N° prix", "Désignation", "Unité", "Prix unitaire HT en chiffres", "Prix en lettres"],
       ["101", "Fourniture et pose de carrelage grès cérame", "m2", 48.37, "quarante-huit euros"],
       ["102", "Plinthes assorties", "ml", 11.09, "onze euros"]]
DQE = [["N°", "Désignation", "Unité", "Quantité", "PU HT", "Montant HT"],
       ["1", "Chape ciment", "m2", 310, 21.47, 6655.7],
       ["2", "Ragréage autolissant", "m2", 310, 9.83, 3047.3]]
PRIX = ("48.37", "48,37", "11.09", "11,09", "21.47", "21,47", "9.83", "9,83",
        "6655", "6 655", "3047", "3 047", "quarante-huit")


class _Piece:
    def __init__(self, nom, type_):
        self.file_name, self.type, self.file_url = nom, type_, f"/uploads/dce/{nom}"
        self.related_lots, self.is_user_completed = ["7"], False


def _xlsx(lignes) -> bytes:
    classeur = openpyxl.Workbook()
    for ligne in lignes:
        classeur.active.append(ligne)
    flux = io.BytesIO()
    classeur.save(flux)
    return flux.getvalue()


@pytest.fixture
def racine(tmp_path):
    (tmp_path / "dce").mkdir()
    (tmp_path / "dce" / "BPU lot 07.xlsx").write_bytes(_xlsx(BPU))
    (tmp_path / "dce" / "DQE lot 07.xlsx").write_bytes(_xlsx(DQE))
    return tmp_path


def test_bpu_et_dqe_donnent_la_liste_sans_prix(racine):
    pieces = [_Piece("BPU lot 07.xlsx", "bpu_template"), _Piece("DQE lot 07.xlsx", "dqe_template")]
    texte = dpgf.texte_ouvrages_du_lot(pieces, "lot7", racine, "Lot 07 — Chape carrelage")

    assert "Fourniture et pose de carrelage grès cérame\tm2" in texte   # BPU : sans quantité
    assert "Chape ciment\tm2\t310" in texte                             # DQE : quantité de l'acheteur
    for prix in PRIX:
        assert prix not in texte
    assert "€" not in texte


def test_l_analyse_du_lot_recoit_la_liste_du_dqe(racine, monkeypatch):
    import routers.analysis as analysis
    monkeypatch.setattr(analysis, "UPLOADS_ROOT", racine)
    dqe = _Piece("DQE lot 07.xlsx", "dqe_template")
    dqe.extracted_text = "Chape ciment\tm2\t310\t21.47\t6655.7 DQE-BRUT"
    spec = analysis._build_lot_spec([dqe], "lot7", {"lot7": "Lot 07 — Chape"}, None, None)
    assert "Ragréage autolissant\tm2\t310" in spec["pass2_text"]
    assert "DQE-BRUT" not in spec["pass2_text"] and "21.47" not in spec["pass2_text"]
