"""Revue de sécurité D1 : un .ods piégé ne gonfle pas le texte envoyé à l'analyse.

Un .ods répète lignes et colonnes par un simple attribut (number-rows-repeated,
number-columns-repeated) : quelques octets de XML peuvent annoncer des millions de cellules, et une
cellule peut porter des mégaoctets de texte. La garde anti-bombe ne compte que la taille décompressée
du fichier : la lecture doit, elle aussi, borner ce qu'elle produit. Fichiers inventés.
"""
import io
import time
import zipfile

import pytest

from services import document_processor as dp
from services.document_processor import DocumentProcessor

_T = "urn:oasis:names:tc:opendocument:xmlns:table:1.0"


def _ods(lignes_xml: str) -> bytes:
    contenu = (
        '<?xml version="1.0" encoding="UTF-8"?><office:document-content '
        'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
        f'xmlns:table="{_T}" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">'
        '<office:body><office:spreadsheet><table:table table:name="Lot">'
        f"{lignes_xml}</table:table></office:spreadsheet></office:body></office:document-content>")
    flux = io.BytesIO()
    with zipfile.ZipFile(flux, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("mimetype", "application/vnd.oasis.opendocument.spreadsheet")
        z.writestr("content.xml", contenu)
    return flux.getvalue()


def _texte(contenu: str, repetee_en_colonnes: int = 1) -> str:
    colonnes = f' table:number-columns-repeated="{repetee_en_colonnes}"' if repetee_en_colonnes > 1 else ""
    return (f'<table:table-cell office:value-type="string"{colonnes}>'
            f"<text:p>{contenu}</text:p></table:table-cell>")


def _extraire(octets: bytes):
    return DocumentProcessor().extract_ex(octets, "Bordereau piégé.ods")


def test_une_rangee_repetee_un_million_de_fois_est_lue_une_fois():
    cellule = _texte("Échafaudage de pied " * 100)                      # ≈ 2 000 caractères
    octets = _ods(f'<table:table-row table:number-rows-repeated="1000000">{cellule}</table:table-row>')
    debut = time.monotonic()
    texte, _pages, _avertissement = _extraire(octets)
    assert time.monotonic() - debut < 5
    assert texte.count("Échafaudage de pied") == 100                    # une seule ligne
    assert len(texte) < 10_000


def test_une_cellule_tres_longue_est_coupee():
    octets = _ods(f"<table:table-row>{_texte('x' * 3_000_000)}</table:table-row>")
    texte, _pages, _avertissement = _extraire(octets)
    assert 0 < len(texte) <= 10_000


def test_colonnes_repetees_un_million_de_fois_bornees():
    octets = _ods(f"<table:table-row>{_texte('Unité', 1_000_000)}</table:table-row>")
    texte, _pages, _avertissement = _extraire(octets)
    assert texte.count("Unité") <= 64


def test_le_texte_total_est_plafonne_et_le_dit(monkeypatch):
    monkeypatch.setattr(dp, "_MAX_CARACTERES_TABLEUR", 200_000)
    # 300 lignes DIFFÉRENTES de ≈ 64 × 9 000 caractères chacune : 170 Mo de texte à produire
    lignes = "".join(
        f"<table:table-row>{_texte(f'Ligne {i} ' + 'y' * 9_000, 64)}</table:table-row>" for i in range(300))
    texte, _pages, avertissement = _extraire(_ods(lignes))
    assert len(texte) <= 200_000 + 10_000 * 64                          # le plafond, à une ligne près
    assert avertissement and "premiers" in avertissement
    for mot in ("manquant", "incomplet", "absent", "erreur"):
        assert mot not in avertissement.lower()
    assert "Ligne 0 " in texte                                          # le début est lu


def test_un_tableur_normal_n_est_pas_touche():
    lignes = "".join(f"<table:table-row>{_texte(f'Poste {i}')}</table:table-row>" for i in range(500))
    texte, _pages, avertissement = _extraire(_ods(lignes))
    assert avertissement is None and texte.count("\n") == 499


def test_la_lecture_commune_borne_le_texte_developpe(tmp_path):
    """Contrôle de DPGF, lots, ouvrages, ancre : une ligne lourde répétée 20 000 fois ne se développe pas
    en milliers de Go (20 000 × 64 colonnes × 10 000 caractères) ; la lecture s'arrête à son budget."""
    from services import lecture_ods

    cellule = _texte("z" * 20_000, 64)
    chemin = tmp_path / "Lourd.ods"
    chemin.write_bytes(_ods(f'<table:table-row table:number-rows-repeated="20000">{cellule}</table:table-row>'))
    (_nom, lignes), = list(lecture_ods.onglets_ods(chemin))
    produit = sum(len(v) for ligne in lignes for v in ligne if isinstance(v, str))
    assert produit <= lecture_ods._MAX_CARACTERES_ODS + 64 * lecture_ods._MAX_CARACTERES_CELLULE
