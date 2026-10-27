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

PDFium n'est pas thread-safe : la fabrique travaille sous ``VERROU_PDFIUM``, comme
``services/pdf_lecture.py``, et ne rend que des octets.
"""
from __future__ import annotations

import ctypes
import io
import re
import textwrap
from pathlib import Path
from typing import Optional

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c

from services.pdf_lecture import VERROU_PDFIUM

A4 = (595.0, 842.0)   # points PDF


def _objet_texte(pdf, police, ligne: str, x: float, y: float, taille: float = 11.0):
    obj = pdfium_c.FPDFPageObj_CreateTextObj(pdf, police, taille)
    tampon = (ligne + "\x00").encode("utf-16-le")
    pdfium_c.FPDFText_SetText(obj, ctypes.cast(tampon, ctypes.POINTER(ctypes.c_ushort)))
    pdfium_c.FPDFPageObj_Transform(obj, 1, 0, 0, 1, x, y)
    return obj


def _enregistrer(pdf) -> bytes:
    sortie = io.BytesIO()
    pdf.save(sortie)
    return sortie.getvalue()


def pdf_texte(
    pages: list[str],
    taille: float = 11.0,
    x: float = 72.0,
    y_haut: float = 100.0,
    largeur_car: Optional[int] = 80,
) -> bytes:
    """Les octets d'un PDF dont la page i porte le texte ``pages[i]`` (``""`` = page vide)."""
    with VERROU_PDFIUM:
        pdf = pdfium.PdfDocument.new()
        try:
            police = pdfium_c.FPDFText_LoadStandardFont(pdf, b"Helvetica")
            for texte in pages:
                page = pdf.new_page(*A4)
                lignes: list[str] = []
                for ligne in texte.split("\n"):
                    lignes += textwrap.wrap(ligne, largeur_car) if (largeur_car and ligne) else [ligne]
                for k, ligne in enumerate(lignes):
                    if ligne:
                        # origine PDF en bas à gauche : la ligne k descend de 1,25 × la taille
                        y = A4[1] - y_haut - k * taille * 1.25
                        pdfium_c.FPDFPage_InsertObject(page, _objet_texte(pdf, police, ligne, x, y, taille))
                page.gen_content()
                page.close()
            return _enregistrer(pdf)
        finally:
            pdf.close()


def ecrire_pdf(chemin: Path, pages: list[str], **options) -> Path:
    """Écrit le PDF de ``pdf_texte(pages, **options)`` dans ``chemin`` et le rend."""
    chemin = Path(chemin)
    chemin.write_bytes(pdf_texte(pages, **options))
    return chemin


def pdf_avec_page_illisible(pages: list[str], numero: int) -> bytes:
    """Le PDF de ``pdf_texte(pages)`` dont la page ``numero`` (1 = première) ne se charge
    plus : son entrée de l'arbre des pages (``/Kids``) devient ``null``, de même longueur
    (la table des positions reste juste) ; ``/Count`` garde le nombre de pages. PDFium
    compte toutes les pages et refuse de charger celle-là ; PyMuPDF refuse le document."""
    octets = pdf_texte(pages)
    debut = octets.index(b"/Kids[")
    fin = octets.index(b"]", debut)
    entree = list(re.finditer(rb"\d+ 0 R", octets[debut:fin]))[numero - 1]
    a, b = debut + entree.start(), debut + entree.end()
    return octets[:a] + b"null".ljust(b - a) + octets[b:]


def images_par_page(octets: bytes) -> list[int]:
    """Relevé pour les tests : le nombre d'images de chaque page d'un PDF (formulaires
    compris), lu sous ``VERROU_PDFIUM`` (remplace ``page.get_images()`` de PyMuPDF)."""
    with VERROU_PDFIUM:
        pdf = pdfium.PdfDocument(octets)
        try:
            nombres = []
            for index in range(len(pdf)):
                page = pdf[index]
                try:
                    nombres.append(sum(1 for _ in page.get_objects(filter=[pdfium_c.FPDF_PAGEOBJ_IMAGE])))
                finally:
                    page.close()
            return nombres
        finally:
            pdf.close()


def pdf_texte_masque(visible: str, masque: str) -> bytes:
    """Une page : ``visible`` en haut, ``masque`` en bas, et un détourage qui ne garde que
    la moitié haute de la page. Le texte du bas est dans le PDF mais invisible : le cas des
    figures qui embarquent la page d'un autre PDF (plan H, §2.3)."""
    with VERROU_PDFIUM:
        pdf = pdfium.PdfDocument.new()
        try:
            police = pdfium_c.FPDFText_LoadStandardFont(pdf, b"Helvetica")
            page = pdf.new_page(*A4)
            pdfium_c.FPDFPage_InsertObject(page, _objet_texte(pdf, police, visible, 72, 742))
            pdfium_c.FPDFPage_InsertObject(page, _objet_texte(pdf, police, masque, 72, 200))
            page.gen_content()
            detourage = pdfium_c.FPDF_CreateClipPath(0, A4[1] / 2, A4[0], A4[1])
            pdfium_c.FPDFPage_InsertClipPath(page, detourage)
            pdfium_c.FPDF_DestroyClipPath(detourage)
            page.close()
            return _enregistrer(pdf)
        finally:
            pdf.close()


def pdf_avec_annotation(texte_page: str, texte_annotation: Optional[str] = None,
                        lien: bool = False) -> bytes:
    """Une page de texte, avec un lien et/ou une annotation (tampon) qui porte
    ``texte_annotation`` HORS du contenu de la page, comme un champ de formulaire rempli
    (plan H, §2.4)."""
    with VERROU_PDFIUM:
        pdf = pdfium.PdfDocument.new()
        try:
            police = pdfium_c.FPDFText_LoadStandardFont(pdf, b"Helvetica")
            page = pdf.new_page(*A4)
            pdfium_c.FPDFPage_InsertObject(page, _objet_texte(pdf, police, texte_page, 72, 742))
            page.gen_content()
            if lien:
                annotation = pdfium_c.FPDFPage_CreateAnnot(page, pdfium_c.FPDF_ANNOT_LINK)
                pdfium_c.FPDFAnnot_SetRect(annotation, pdfium_c.FS_RECTF(72, 735, 200, 755))
                pdfium_c.FPDFAnnot_SetURI(annotation, b"https://exemple.fr\x00")
                pdfium_c.FPDFPage_CloseAnnot(annotation)
            if texte_annotation:
                annotation = pdfium_c.FPDFPage_CreateAnnot(page, pdfium_c.FPDF_ANNOT_STAMP)
                pdfium_c.FPDFAnnot_SetRect(annotation, pdfium_c.FS_RECTF(60, 580, 400, 640))
                pdfium_c.FPDFAnnot_AppendObject(annotation, _objet_texte(pdf, police, texte_annotation, 72, 600))
                pdfium_c.FPDFPage_CloseAnnot(annotation)
            page.close()
            return _enregistrer(pdf)
        finally:
            pdf.close()


def pdf_piege(mo: int) -> bytes:
    """PDF « bombe » : un flux de contenu Flate qui se décompresse en ``mo`` Mo de blancs
    (quelques centaines de Ko sur le disque). Sans plafond, PDFium alloue tout au chargement
    de la page. Fabriqué à la main : aucune donnée de DCE."""
    import zlib
    c = zlib.compressobj(9)
    bloc = b" " * (1 << 20)
    flux = b"".join([c.compress(bloc) for _ in range(mo)] + [c.flush()])
    objets = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R>>",
        b"<</Length %d/Filter/FlateDecode>>\nstream\n" % len(flux) + flux + b"\nendstream",
    ]
    sortie, positions = bytearray(b"%PDF-1.4\n"), []
    for i, o in enumerate(objets, 1):
        positions.append(len(sortie))
        sortie += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(sortie)
    sortie += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objets) + 1)
    for p in positions:
        sortie += b"%010d 00000 n \n" % p
    sortie += b"trailer\n<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF\n" % (len(objets) + 1, xref)
    return bytes(sortie)


def pdf_pivote(octets: bytes, angle: int, taille_page: Optional[tuple[float, float]] = None) -> bytes:
    """Le même PDF dont la première page porte /Rotate ``angle`` (90, 180, 270) ; si
    ``taille_page`` est donnée, sa MediaBox devient (largeur, hauteur) en points."""
    with VERROU_PDFIUM:
        pdf = pdfium.PdfDocument(octets)
        try:
            page = pdf[0]
            page.set_rotation(angle)
            if taille_page is not None:
                page.set_mediabox(0, 0, *taille_page)
            page.close()
            return _enregistrer(pdf)
        finally:
            pdf.close()
