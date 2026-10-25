"""Les .ods se lisent sans odfpy — bloc 2.

odfpy n'est pas installé en production (absent de requirements.txt), l'une de
ses licences est la GPL, et il charge tout content.xml. Avant, le contrôle de
forme d'une DPGF (.ods) et la détection des lots l'importaient : en production,
ils échouaient sans rien dire.

Ici, tout import du paquet `odf` échoue, comme en production. Le contrôle de
DPGF, la détection des lots et la liste des ouvrages lisent quand même le .ods.
"""
import io
import sys
import zipfile

import pytest


def _cellule(v):
    if v is None:
        return "<table:table-cell/>"
    if isinstance(v, (int, float)):
        return (f'<table:table-cell office:value-type="float" office:value="{v}">'
                f"<text:p>{v}</text:p></table:table-cell>")
    return f'<table:table-cell office:value-type="string"><text:p>{v}</text:p></table:table-cell>'


def _ods(onglets: dict) -> bytes:
    tables = "".join(
        f'<table:table table:name="{nom}">'
        + "".join("<table:table-row>" + "".join(_cellule(v) for v in ligne)
                  + '<table:table-cell table:number-columns-repeated="16000"/></table:table-row>'
                  for ligne in lignes)
        + "</table:table>" for nom, lignes in onglets.items())
    contenu = (
        '<?xml version="1.0" encoding="UTF-8"?><office:document-content '
        'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
        'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
        'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">'
        f"<office:body><office:spreadsheet>{tables}</office:spreadsheet></office:body>"
        "</office:document-content>")
    flux = io.BytesIO()
    with zipfile.ZipFile(flux, "w") as z:
        z.writestr("mimetype", "application/vnd.oasis.opendocument.spreadsheet")
        z.writestr("content.xml", contenu)
    return flux.getvalue()


DPGF_REMPLIE = {
    "Lot 05 - Façades": [
        ["Tranche ferme"],
        ["N°", "Désignation", "Unité", "Quantité", "Prix unitaire HT", "Montant HT"],
        ["1", "Échafaudage de pied", "ens", 1, 4300.0, 4300.0],
        ["2", "Enduit monocouche", "m2", 240, 38.5, 9240.0],
    ],
    "Feuille 2": [["Lot 03 : Menuiseries extérieures"], ["Voir le lot 03"]],
}


@pytest.fixture
def sans_odfpy(monkeypatch):
    """Tout import de `odf` (et de ses sous-modules) échoue, comme en production."""
    for nom in [n for n in list(sys.modules) if n == "odf" or n.startswith("odf.")]:
        monkeypatch.setitem(sys.modules, nom, None)
    for nom in ("odf", "odf.opendocument", "odf.table", "odf.text"):
        monkeypatch.setitem(sys.modules, nom, None)
    with pytest.raises(ImportError):
        import odf  # noqa: F401


@pytest.fixture
def ods(tmp_path):
    chemin = tmp_path / "DPGF lot 05.ods"
    chemin.write_bytes(_ods(DPGF_REMPLIE))
    return chemin


def test_controle_de_dpgf_sans_odfpy(sans_odfpy, ods):
    from services.dpgf_checker import check_dpgf
    rapport = check_dpgf(ods)
    assert not any("Erreur de lecture" in w for w in rapport["warnings"]), rapport
    assert rapport["nb_lignes_remplies"] >= 2


def test_detection_des_lots_sans_odfpy(sans_odfpy, ods):
    from services.lot_detector import detect_lots_from_excel
    lots = {d["id"]: d for d in detect_lots_from_excel(str(ods))}
    assert {"lot5", "lot3"} <= set(lots)                       # nom d'onglet, cellule
    assert "Tranche ferme" in lots["lot5"].get("tranches", [])


def test_liste_des_ouvrages_sans_odfpy(sans_odfpy, ods):
    from models.project import TYPE_DPGF
    from services.dpgf_ouvrages import texte_ouvrages_du_lot

    class _Piece:
        file_name, type, file_url = ods.name, TYPE_DPGF, f"/uploads/{ods.name}"
        related_lots, is_user_completed = ["5"], False

    texte = texte_ouvrages_du_lot([_Piece()], "lot5", ods.parent, "Lot 05 — Façades")
    assert "Enduit monocouche\tm2\t240" in texte and "38" not in texte
