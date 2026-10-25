"""Sous-lots « 01a » / « 01b » et normalisation des numéros de lot — bloc 2.

Règle (décision du 25/10) :
  - si le RC ne définit que le lot 01, les pièces « 01a » et « 01b » se
    rattachent au lot 01 ;
  - si le RC définit lui-même 01a et 01b comme des lots, ils restent séparés.
Avant : « 01a » ne rejoignait jamais « 1a » (zéro gardé), ni le lot 01. Sur
Gueux, les DPGF « Lot 01a GO » et « Lot 01b STB » n'allaient à aucun lot.
"""
import io

import openpyxl
import pytest

from models.project import TYPE_DPGF
from services.document_tagger import _normalize_lot_num, assign_document_lots, get_documents_for_lot


class _Piece:
    def __init__(self, nom, lots, type_="cctp"):
        self.file_name, self.related_lots, self.type = nom, lots, type_
        self.extracted_text, self.is_user_completed = "texte", False
        self.file_url = f"/uploads/dce/{nom}"


@pytest.mark.parametrize("brut,attendu", [
    ("01a", "1a"), ("lot01A", "1a"), ("Lot 01b", "1b"), ("05", "5"), ("00", "0"), ("lot12", "12"),
])
def test_normalisation(brut, attendu):
    assert _normalize_lot_num(brut) == attendu


def test_etiquette_d_un_sous_lot_sans_zero():
    assert assign_document_lots("DPGF Lot 01a GO.xlsx", TYPE_DPGF) == ["1a"]


GO, STB = _Piece("DPGF Lot 01a GO.xlsx", ["01a"]), _Piece("DPGF Lot 01b STB.xlsx", ["01b"])
LOT1, LOT2 = _Piece("CCTP lot 01.pdf", ["1"]), _Piece("CCTP lot 02.pdf", ["2"])


def test_le_rc_ne_definit_que_le_lot_01_les_sous_lots_s_y_rattachent():
    pieces = [GO, STB, LOT1, LOT2]
    assert get_documents_for_lot(pieces, "lot1", ["lot1", "lot2"]) == [GO, STB, LOT1]
    assert get_documents_for_lot(pieces, "lot2", ["lot1", "lot2"]) == [LOT2]


def test_le_rc_definit_01a_et_01b_ils_restent_separes():
    pieces = [GO, STB, LOT1]
    lots = ["lot1a", "lot1b", "lot2"]
    assert get_documents_for_lot(pieces, "lot1a", lots) == [GO]      # « 01a » rejoint « 1a »
    assert get_documents_for_lot(pieces, "lot1b", lots) == [STB]
    assert get_documents_for_lot(pieces, "lot1", lots) == [LOT1]


def test_liste_des_lots_inconnue_rien_n_est_rattache():
    assert get_documents_for_lot([GO, LOT1], "lot1") == [LOT1]


def test_la_liste_des_ouvrages_du_lot_01_lit_ses_sous_lots(tmp_path):
    from services.dpgf_ouvrages import texte_ouvrages_du_lot
    classeur = openpyxl.Workbook()
    classeur.active.append(["Désignation", "Unité", "Quantité", "Prix unitaire"])
    classeur.active.append(["Béton de fondation", "m3", 18, 120.0])
    flux = io.BytesIO()
    classeur.save(flux)
    (tmp_path / "dce").mkdir()
    (tmp_path / "dce" / "DPGF Lot 01a GO.xlsx").write_bytes(flux.getvalue())
    piece = _Piece("DPGF Lot 01a GO.xlsx", ["01a"], type_=TYPE_DPGF)

    texte = texte_ouvrages_du_lot([piece], "lot1", tmp_path, "Lot 01 — Gros œuvre",
                                  lots_du_rc=["lot1", "lot2"])
    assert "Béton de fondation\tm3\t18" in texte


def test_l_analysis_du_lot_01_recoit_ses_sous_lots():
    from routers.analysis import _build_lot_spec
    go = _Piece("CCTP Lot 01a GO.pdf", ["01a"])
    go.extracted_text = "CCTP-SOUS-LOT-01A " * 10
    spec = _build_lot_spec([go], "lot1", {"lot1": "Lot 01", "lot2": "Lot 02"}, None, None)
    assert "CCTP-SOUS-LOT-01A" in spec["pass2_text"]
