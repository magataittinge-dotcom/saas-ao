"""Tableurs du DCE : les .ods et .xlsm se lisent comme des .xlsx (D1).

Classeurs inventés. Un .xlsx fabriqué par openpyxl n'a jamais été recalculé : les formules y
sont sans valeur en cache. `_xlsx_avec_cache` y écrit la valeur qu'un tableur aurait enregistrée.
"""
import io
import zipfile

import openpyxl
import pytest

from services.document_processor import DocumentProcessor


# ─── Classeurs inventés ───────────────────────────────────────────────────────

def _xlsx(lignes: dict, cache: dict | None = None) -> bytes:
    """lignes : {onglet: [[valeurs…]]} ; cache : {formule sans '=': valeur en cache} (None = jamais recalculé)."""
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for nom, rangees in lignes.items():
        ws = wb.create_sheet(nom)
        for rangee in rangees:
            ws.append(rangee)
    flux = io.BytesIO()
    wb.save(flux)
    octets = flux.getvalue()
    if not cache:
        return octets
    sortie = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(octets)) as src, zipfile.ZipFile(sortie, "w", zipfile.ZIP_DEFLATED) as dst:
        for info in src.infolist():
            donnees = src.read(info.filename)
            if info.filename.startswith("xl/worksheets/sheet"):
                texte = donnees.decode("utf-8")
                for formule, valeur in cache.items():
                    texte = texte.replace(f"<f>{formule}</f><v></v>", f"<f>{formule}</f><v>{valeur}</v>")
                donnees = texte.encode("utf-8")
            dst.writestr(info.filename, donnees)
    return sortie.getvalue()


def _cellule(v):
    """v : None, nombre, texte, ou ('formule', 'of:=…', valeur en cache ou None)."""
    if v is None:
        return "<table:table-cell/>"
    if isinstance(v, tuple):
        _, formule, valeur = v
        if valeur is None:      # écrit par un outil qui n'a rien calculé
            return f'<table:table-cell table:formula="{formule}"/>'
        return (f'<table:table-cell table:formula="{formule}" office:value-type="float" '
                f'office:value="{valeur}"><text:p>{valeur}</text:p></table:table-cell>')
    if isinstance(v, (int, float)):
        return (f'<table:table-cell office:value-type="float" office:value="{v}">'
                f"<text:p>{v}</text:p></table:table-cell>")
    return f'<table:table-cell office:value-type="string"><text:p>{v}</text:p></table:table-cell>'


def _ods(onglets: dict) -> bytes:
    tables = "".join(
        f'<table:table table:name="{nom}">'
        + "".join("<table:table-row>" + "".join(_cellule(v) for v in ligne) + "</table:table-row>"
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


BORDEREAU = {
    "Lot 05 - Façades": [
        ["N°", "Désignation", "Unité", "Quantité", "Prix unitaire HT", "Montant HT"],
        ["1", "Échafaudage de pied", "ens", 1, 4300.0, 4300.0],
        ["2", "Enduit monocouche gratté", "m2", 240, 38.5, 9240.0],
    ],
    "Planning": [["Phase", "Durée"], ["Ravalement de la façade nord", 6]],
}


def _extraire(octets_ou_chemin, nom):
    return DocumentProcessor().extract_ex(octets_ou_chemin, nom)


# ─── D1 : les .ods sont lus ───────────────────────────────────────────────────

def test_ods_lu_comme_un_xlsx():
    texte, pages, avertissement = _extraire(_ods(BORDEREAU), "Bordereau lot 05.ods")
    assert avertissement is None
    assert "Enduit monocouche gratté\tm2\t240\t38.5\t9240" in texte     # nombres entiers sans « .0 »
    assert "Échafaudage de pied\tens\t1\t4300\t4300" in texte
    assert "Ravalement de la façade nord\t6" in texte                  # l'onglet suivant est lu aussi


def test_ods_lu_par_son_chemin(tmp_path):
    chemin = tmp_path / "DPGF lot 05.ods"
    chemin.write_bytes(_ods(BORDEREAU))
    texte, _pages, avertissement = _extraire(chemin, chemin.name)
    assert avertissement is None and "Enduit monocouche gratté" in texte


def test_xlsm_lu_comme_un_xlsx():
    texte, _pages, avertissement = _extraire(_xlsx(BORDEREAU), "DPGF lot 05.xlsm")
    assert avertissement is None and "Enduit monocouche gratté" in texte


def test_ods_illisible_dit_pourquoi_et_quoi_faire():
    texte, _pages, avertissement = _extraire(b"PK\x03\x04 ce n'est pas un classeur", "Bordereau.ods")
    assert texte == ""
    assert avertissement and "non lisible" in avertissement.lower()
    assert ".xlsx" in avertissement                       # la sortie de secours est dite
    assert "corrompu ou format non reconnu" not in avertissement   # message propre aux tableurs


def test_depot_direct_d_un_ods_ou_xlsm_accepte():
    from routers import projects
    assert {".ods", ".xlsm"} <= projects._ALLOWED_EXTENSIONS
    assert "ODS" in projects._FORMATS_DCE and "XLSM" in projects._FORMATS_DCE
    assert ".xlsm" in projects._ZIP_ALLOWED


def test_detection_des_lots_lit_un_xlsm(tmp_path):
    from services.lot_detector import detect_lots_from_excel
    chemin = tmp_path / "DPGF lot 05.xlsm"
    chemin.write_bytes(_xlsx(BORDEREAU))
    assert "lot5" in {d["id"] for d in detect_lots_from_excel(str(chemin))}
