"""Fabrique de PDF de test sans PyMuPDF (pypdfium2 seul) — plan H, §4.2.

Remplace, dans les tests, ``fitz.open()`` + ``new_page()`` + ``insert_text`` /
``insert_textbox`` + ``save`` / ``tobytes`` :
- police standard Helvetica (aucun fichier de police) ;
- une ligne de texte = un objet texte ; « \\n » = ligne suivante ;
- retour à la ligne automatique à ``largeur_car`` caractères (80 par défaut) :
  au-delà, une ligne sort de la page A4 et les lecteurs la coupent ;
  ``largeur_car=None`` garde chaque ligne entière, comme ``insert_text`` ;
- ``""`` = page vide (cas du « PDF scanné »).

Aller-retour exact, vérifié : PyMuPDF (``page.get_text()``) relit le texte écrit,
lignes repliées comprises, suivi d'un « \\n » final ; accents, « — », « ’ », « œ »,
« « » » et « % » compris.
"""
from __future__ import annotations

import ctypes
import io
import textwrap
from pathlib import Path
from typing import Optional

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c

A4 = (595.0, 842.0)   # points PDF


def pdf_texte(
    pages: list[str],
    taille: float = 11.0,
    x: float = 72.0,
    y_haut: float = 100.0,
    largeur_car: Optional[int] = 80,
) -> bytes:
    """Les octets d'un PDF dont la page i porte le texte ``pages[i]`` (``""`` = page vide)."""
    pdf = pdfium.PdfDocument.new()
    try:
        police = pdfium_c.FPDFText_LoadStandardFont(pdf, b"Helvetica")
        for texte in pages:
            page = pdf.new_page(*A4)
            lignes: list[str] = []
            for ligne in texte.split("\n"):
                lignes += textwrap.wrap(ligne, largeur_car) if (largeur_car and ligne) else [ligne]
            for k, ligne in enumerate(lignes):
                if not ligne:
                    continue
                obj = pdfium_c.FPDFPageObj_CreateTextObj(pdf, police, taille)
                tampon = (ligne + "\x00").encode("utf-16-le")
                pdfium_c.FPDFText_SetText(obj, ctypes.cast(tampon, ctypes.POINTER(ctypes.c_ushort)))
                # origine PDF en bas à gauche : la ligne k descend de 1,25 × la taille
                pdfium_c.FPDFPageObj_Transform(obj, 1, 0, 0, 1, x, A4[1] - y_haut - k * taille * 1.25)
                pdfium_c.FPDFPage_InsertObject(page, obj)
            page.gen_content()
            page.close()
        sortie = io.BytesIO()
        pdf.save(sortie)
        return sortie.getvalue()
    finally:
        pdf.close()


def ecrire_pdf(chemin: Path, pages: list[str], **options) -> Path:
    """Écrit le PDF de ``pdf_texte(pages, **options)`` dans ``chemin`` et le rend."""
    chemin = Path(chemin)
    chemin.write_bytes(pdf_texte(pages, **options))
    return chemin
