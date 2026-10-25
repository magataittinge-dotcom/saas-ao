"""Lot 00 / 0 = commun à tous les lots (services/document_tagger.py) — bloc 2."""
import pytest

from services.document_tagger import assign_document_lots


# ── Lot 00 / 0 : prescriptions communes à tous les lots ─────────────────────────
# Avant : « lot 00 Généralités » était rattaché au lot « 0 », qui n'existe pas :
# sur Gueux, 126 000 caractères de prescriptions communes jamais analysés.

class _Piece:
    def __init__(self, nom, lots, type_="cctp", texte="texte"):
        self.file_name, self.related_lots, self.type = nom, lots, type_
        self.extracted_text, self.file_url, self.is_user_completed = texte, "", False


@pytest.mark.parametrize("nom", [
    "EQ2501_Ecole Exemple_lot 00 Généralités_DCE.pdf",
    "CCTP Lot 0 - Prescriptions communes.pdf",
    "CCTP_LOT00.docx",
])
def test_lot_00_rattache_a_tous_les_lots(nom):
    assert assign_document_lots(nom, "cctp") == ["all"]


@pytest.mark.parametrize("etiquette", ["0", "00"])
def test_etiquette_lot_0_deja_en_base_comptee_pour_chaque_lot(etiquette):
    from services.document_tagger import get_documents_for_lot
    generalites = _Piece("lot 00 Généralités.pdf", [etiquette])
    lot5 = _Piece("CCTP lot 05.pdf", ["5"])
    assert get_documents_for_lot([generalites, lot5], "lot5") == [generalites, lot5]
    assert get_documents_for_lot([generalites, lot5], "lot9") == [generalites]


def test_les_generalites_entrent_dans_la_passe_2_de_chaque_lot():
    from routers.analysis import _build_lot_spec
    docs = [_Piece("CCTP lot 00 Généralités.pdf", ["0"], texte="PRESCRIPTIONS-COMMUNES " * 10),
            _Piece("CCTP lot 05.pdf", ["5"], texte="CCTP-LOT-5 " * 10)]
    for lot in ("lot5", "lot9"):
        spec = _build_lot_spec(docs, lot, {}, None, None)
        assert "PRESCRIPTIONS-COMMUNES" in spec["pass2_text"]
