"""Positions du texte d'un PDF — sujet A (« Voir dans le DCE »), tranche A1.

Pour retrouver un passage de l'analyse sur la page d'un PDF, il faut deux choses :
- le texte de la page INDEXÉ PAR CARACTÈRE, dans le même ordre que les boîtes de
  caractères de PDFium ;
- les rectangles des caractères d'un passage.

Même lecture que l'extraction. Les pages passent par ``pdf_lecture._avec_page`` : champs
de formulaire aplatis, même textpage, même filtre du texte masqué par un détourage (H §2.3).
Le texte cité à l'IA et les positions viennent donc du même moteur et de la même lecture.
Un caractère masqué n'est jamais retrouvé dans le passage et ne reçoit jamais de rectangle.

Pourquoi un texte « par caractère » (H §5, point 2). ``get_text_range()`` saute des
U+0003 sur certaines pages (10 pages sur 1 328 à Gueux) : l'index du texte se décale alors,
jusqu'à 21 caractères, par rapport à ``get_charbox()``. Le texte est donc lu caractère par
caractère (``FPDFText_GetUnicode``), un caractère par index de ``FPDFText_CountChars``.
Les caractères masqués y sont remplacés par U+0000 pour garder l'alignement.

Le « flux » d'une page : ses lettres et chiffres seulement, sans accents, en minuscules.
Espaces, ponctuation, tirets, apostrophes, césures (U+0002) et sauts de ligne n'y comptent
pas : deux textes qui ne diffèrent que par ces détails ont le même flux.

Rectangles. Fractions du cadre visible de la page (cropbox), origine EN HAUT À GAUCHE,
dans la page NON tournée : [x0, y0, x1, y1] entre 0 et 1. La rotation de la page
(``PageTexte.rotation``, 0, 90, 180 ou 270 degrés dans le sens des aiguilles d'une montre)
est décrite dans l'ancre et appliquée à l'affichage ; ``tourner_rectangle`` donne la
transformation. Un passage sur plusieurs lignes donne un rectangle par ligne.

Threads. Tout objet PDFium est ouvert et fermé sous ``VERROU_PDFIUM`` par pdf_lecture ; ce
module ne garde que des ``str``, des nombres et des tuples. Il n'importe pas pypdfium2.
"""
from __future__ import annotations

import unicodedata
from array import array
from typing import NamedTuple, Optional

from services import pdf_lecture
from services.pdf_lecture import VERROU_PDFIUM, PdfIllisible

__all__ = [
    "CESURE",
    "LecturePdf",
    "MASQUE",
    "PageTexte",
    "forme_flux",
    "ouvrir",
    "tourner_rectangle",
]

MASQUE = "\x00"      # remplace un caractère masqué dans PageTexte.texte
CESURE = "\x02"      # trait d'union de fin de ligne (PDFium)

# ─── Flux alphanumérique ──────────────────────────────────────────────────────

_FORMES: dict[str, str] = {}


def _forme(car: str) -> str:
    """Lettres et chiffres d'un caractère, sans accents, en minuscules (« ﬁ » → « fi »)."""
    forme = _FORMES.get(car)
    if forme is None:
        decompose = unicodedata.normalize("NFKD", car)
        sans_accent = "".join(c for c in decompose if not unicodedata.combining(c)).lower()
        forme = "".join(c for c in sans_accent if c.isalnum())
        _FORMES[car] = forme
    return forme


def forme_flux(texte: str) -> tuple[str, array]:
    """(flux, origine) : les lettres et chiffres normalisés de ``texte`` et, pour chacun,
    l'index du caractère de ``texte`` dont il vient (une ligature donne deux lettres qui
    ont la même origine)."""
    sortie: list[str] = []
    origine = array("i")
    for i, car in enumerate(texte):
        forme = _forme(car)
        if forme:
            sortie.append(forme)
            origine.extend([i] * len(forme))
    return "".join(sortie), origine


# ─── Une page ─────────────────────────────────────────────────────────────────

class PageTexte(NamedTuple):
    """Le texte d'une page, sans aucun objet PDFium."""

    index: int               # 0 = première page
    texte: str               # un caractère par index de PDFium ; masqués : U+0000
    flux: str                # lettres et chiffres normalisés
    origine: array           # origine[k] : index (dans texte) du caractère du flux[k]
    rotation: int            # 0, 90, 180 ou 270 (sens des aiguilles d'une montre)
    largeur: float           # cadre visible non tourné, en points PDF
    hauteur: float


def _lire_page(page, textpage, masques: frozenset, index: int) -> PageTexte:
    """Sous le verrou : texte par caractère, flux, rotation et taille du cadre."""
    brut = pdf_lecture.pdfium_c.FPDFText_GetUnicode
    morceaux: list[str] = []
    for i in range(textpage.count_chars()):
        if i in masques:
            morceaux.append(MASQUE)
            continue
        code = brut(textpage, i)
        morceaux.append(chr(code) if code < 0x110000 and not 0xD800 <= code <= 0xDFFF else "�")
    texte = "".join(morceaux)
    flux, origine = forme_flux(texte)
    gauche, bas, droite, haut = page.get_cropbox()
    return PageTexte(index, texte, flux, origine, int(page.get_rotation()) % 360,
                     float(droite - gauche), float(haut - bas))


def _boites(page, textpage, masques: frozenset, a: int, b: int, texte: str) -> list[list[float]]:
    """Sous le verrou : un rectangle (fractions) par ligne pour les caractères a..b."""
    gauche, bas, droite, haut = page.get_cropbox()
    largeur, hauteur = (droite - gauche) or 1.0, (haut - bas) or 1.0
    lignes: list[list[float]] = []
    precedent: Optional[list[float]] = None
    for i in range(max(a, 0), min(b, len(texte) - 1) + 1):
        car = texte[i]
        if car.isspace() or car in (CESURE, MASQUE) or i in masques:
            continue
        try:
            g, bs, d, h = textpage.get_charbox(i, loose=True)
        except Exception:
            continue                        # caractère généré : pas de boîte
        if d - g <= 0 or h - bs <= 0:
            continue
        courant = [g, bs, d, h]
        if lignes and _continue(lignes[-1], precedent, g, bs, d, h):
            ligne = lignes[-1]
            ligne[0], ligne[1] = min(ligne[0], g), min(ligne[1], bs)
            ligne[2], ligne[3] = max(ligne[2], d), max(ligne[3], h)
        else:
            lignes.append(list(courant))
        precedent = courant
    return [[_borner((g - gauche) / largeur), _borner((haut - h) / hauteur),
             _borner((d - gauche) / largeur), _borner((haut - bs) / hauteur)]
            for g, bs, d, h in lignes]


def _borner(x: float) -> float:
    return round(min(max(x, 0.0), 1.0), 5)


def _recouvrement(a0: float, a1: float, b0: float, b1: float) -> float:
    """Part de la plus petite des deux étendues qui est commune (0 à 1)."""
    commun = min(a1, b1) - max(a0, b0)
    return commun / (min(a1 - a0, b1 - b0) or 1.0) if commun > 0 else 0.0


def _continue(ligne: list[float], precedent: list[float], g: float, bs: float, d: float, h: float) -> bool:
    """Le caractère (g, bs, d, h) prolonge la ligne en cours, dont ``precedent`` est le
    dernier caractère : texte horizontal (même hauteur, à droite, sans grand vide), ou texte
    vertical d'un plan (même colonne, contre le caractère précédent, ligne encore étroite)."""
    taille = max(h - bs, d - g)
    if _recouvrement(precedent[1], precedent[3], bs, h) >= 0.5:
        return g >= ligne[0] - 2 and g - ligne[2] <= 4 * taille
    etroite = ligne[2] - ligne[0] <= 1.5 * (precedent[2] - precedent[0])
    return (etroite and _recouvrement(precedent[0], precedent[2], g, d) >= 0.8
            and min(abs(bs - precedent[3]), abs(h - precedent[1])) <= taille)


def tourner_rectangle(rect: list[float], rotation: int) -> list[float]:
    """Le rectangle [x0, y0, x1, y1] (fractions, page non tournée, origine en haut à
    gauche) tel qu'il se place sur la page AFFICHÉE après sa rotation de ``rotation`` degrés
    dans le sens des aiguilles d'une montre (``/Rotate`` du PDF)."""
    x0, y0, x1, y1 = rect
    r = rotation % 360
    if r == 90:
        return [round(1 - y1, 5), x0, round(1 - y0, 5), x1]
    if r == 180:
        return [round(1 - x1, 5), round(1 - y1, 5), round(1 - x0, 5), round(1 - y0, 5)]
    if r == 270:
        return [y0, round(1 - x1, 5), y1, round(1 - x0, 5)]
    return list(rect)


# ─── Un document ──────────────────────────────────────────────────────────────

class LecturePdf:
    """Un PDF ouvert pour chercher des passages. Se ferme avec ``fermer()`` ou ``with``.

    ``page(i)`` lit une page une seule fois (cache). ``rectangles(i, a, b)`` rouvre la page
    pour lire les boîtes de ses caractères a..b (index de ``PageTexte.texte``)."""

    def __init__(self, source: pdf_lecture.Source) -> None:
        chemin, octets = pdf_lecture._source(source)
        self._octets = octets           # PDFium lit dans ce tampon jusqu'à la fermeture
        with VERROU_PDFIUM:
            self._pdf, self.nombre_pages = pdf_lecture._ouvrir(chemin, octets)
        self._pages: dict[int, Optional[PageTexte]] = {}

    def page(self, index: int) -> Optional[PageTexte]:
        """La page ``index`` (0 = première), ou None si elle n'existe pas ou ne se charge pas."""
        if not 0 <= index < self.nombre_pages:
            return None
        if index not in self._pages:
            try:
                lue, _lourde = pdf_lecture._avec_page(
                    self._pdf, index,
                    lambda page, textpage, masques: _lire_page(page, textpage, masques, index))
            except PdfIllisible:
                lue = None
            self._pages[index] = lue
        return self._pages[index]

    def rectangles(self, index: int, a: int, b: int) -> list[list[float]]:
        """Les rectangles (fractions du cadre, origine en haut à gauche, page non tournée)
        des caractères a..b de la page, un par ligne. Blancs, U+0002 et caractères masqués
        n'en ont pas. Liste vide si la page ne se lit pas."""
        lue = self.page(index)
        if lue is None:
            return []
        try:
            rects, _lourde = pdf_lecture._avec_page(
                self._pdf, index,
                lambda page, textpage, masques: _boites(page, textpage, masques, a, b, lue.texte))
        except PdfIllisible:
            return []
        return rects

    def fermer(self) -> None:
        if self._pdf is not None:
            with VERROU_PDFIUM:
                self._pdf.close()
            self._pdf = None
            self._octets = None

    def __enter__(self) -> "LecturePdf":
        return self

    def __exit__(self, *_exc) -> None:
        self.fermer()


def ouvrir(source: pdf_lecture.Source) -> LecturePdf:
    """``with ouvrir(chemin_ou_octets) as pdf:`` — voir ``LecturePdf``. Lève
    ``PdfIllisible`` si PDFium ne sait pas lire le document, ``OSError`` pour un chemin."""
    return LecturePdf(source)
