"""Lecture du texte des PDF avec pypdfium2 (PDFium) — plan H : passage de PyMuPDF (AGPL)
à pypdfium2 (Apache-2.0 ou BSD-3-Clause).

SEUL module de l'appli qui importe ``pypdfium2`` (garde : tests/test_pdf_lecture.py ; la
fabrique de PDF des tests l'importe aussi, sous le même verrou). Pas encore branché : l'extraction au dépôt, l'ancrage, les lots et le CCP lisent encore
avec PyMuPDF (bascule : tranches T6 et T7 du plan H).

``lire_pages`` rend le texte de chaque page dans la forme de ``page.get_text()`` de
PyMuPDF (lignes séparées par « \\n », « \\n » final), pour que le texte stocké et les
extraits déjà ancrés restent comparables. Une page passe par :
aplatissement des champs → textpage → filtre du texte masqué → texte → normalisation.

Threads. Doc pypdfium2 (« Incompatibility with threading ») : « PDFium is inherently not
thread-safe. It is not allowed to call pdfium functions simultaneously across different
threads, not even with different documents. » Et pypdfium2 appelle PDFium par
``ctypes.CDLL``, qui relâche le GIL : deux threads l'exécutent vraiment en même temps
(mesuré par H : sans verrou, le processus meurt 4 fois sur 4 ; avec, 0 erreur). D'où :
- tout appel PDFium du processus se fait sous ``VERROU_PDFIUM``, pris PAGE PAR PAGE : une
  lecture attend au plus une page (2,4 s pour le plus gros plan de Gueux), pas un document ;
- tout objet pdfium (document, page, textpage, annotation) est ouvert ET fermé sous le
  verrou : un objet oublié serait fermé par son finaliseur (``weakref.finalize``), depuis
  n'importe quel thread, hors verrou ;
- seuls des ``str``, des nombres ou des tuples sortent du verrou.
Le verrou vaut pour un processus : chaque processus de travail a son propre PDFium.
"""
from __future__ import annotations

import ctypes
import os
import threading
from pathlib import Path
from typing import Callable, Optional, TypeVar, Union

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c

__all__ = [
    "ERREUR_FORMAT",
    "ERREUR_MOT_DE_PASSE",
    "ERREUR_PAGE",
    "PdfIllisible",
    "SEUIL_OBJETS",
    "VERROU_PDFIUM",
    "lire_pages",
    "normaliser_texte_pdfium",
]

VERROU_PDFIUM = threading.RLock()

# Au-delà de ce nombre d'objets sur une page, formulaires compris (plans vectoriels : jusqu'à
# 1,3 million sur Gueux), le filtre du texte masqué n'est pas appliqué (trop cher : H §2.3)
# et la mémoire est rendue au système après le document (H §3.3).
SEUIL_OBJETS = 20_000

# Codes d'erreur PDFium (FPDF_ERR_* de fpdfview.h), portés par PdfIllisible.code.
ERREUR_FORMAT = pdfium_c.FPDF_ERR_FORMAT            # 3 : corrompu, tronqué, ou pas un PDF
ERREUR_MOT_DE_PASSE = pdfium_c.FPDF_ERR_PASSWORD    # 4 : protégé par un mot de passe d'ouverture
ERREUR_PAGE = pdfium_c.FPDF_ERR_PAGE                # 6 : document sans page, ou page illisible

_CAUSES = {
    pdfium_c.FPDF_ERR_UNKNOWN: "erreur inconnue",
    pdfium_c.FPDF_ERR_FILE: "fichier illisible",
    ERREUR_FORMAT: "format non reconnu ou fichier abîmé",
    ERREUR_MOT_DE_PASSE: "protégé par un mot de passe d'ouverture",
    pdfium_c.FPDF_ERR_SECURITY: "protection non prise en charge",
    ERREUR_PAGE: "document sans page ou page illisible",
}


class PdfIllisible(Exception):
    """PDF que PDFium ne sait pas lire. ``code`` : code d'erreur PDFium (``ERREUR_*``)."""

    def __init__(self, code: Optional[int], detail: str = "") -> None:
        super().__init__(code, detail)
        self.code = code
        self.detail = detail

    def __str__(self) -> str:
        suite = f", {self.detail}" if self.detail else ""
        return f"PDF illisible : {_CAUSES.get(self.code, 'erreur inconnue')} (code PDFium {self.code}{suite})"


# ─── Normalisation (H §2.2) ───────────────────────────────────────────────────

_CESURES = ("\x02", "￾")


def normaliser_texte_pdfium(texte: str) -> str:
    """Texte d'une page PDFium → même forme que ``page.get_text()`` de PyMuPDF.

    - « \\r\\n » → « \\n » : PDFium sépare les lignes par CRLF ;
    - trait d'union de fin de ligne : PDFium le remplace par U+0002 (U+FFFE avec
      ``get_text_range``) ET supprime le saut de ligne ; on rend « -\\n », exactement comme
      PyMuPDF (« celui-\\nci »), pour que les extraits déjà en base restent retrouvables.
      Suivi d'une fin de ligne : un seul « \\n » ;
    - « \\n » final sur toute page non vide, comme PyMuPDF ; page vide → chaîne vide.
    Les ligatures, que PDFium déplie déjà, ne sont pas recréées."""
    if not texte:
        return ""
    t = texte.replace("\r\n", "\n").replace("\r", "\n")
    for cesure in _CESURES:
        if cesure in t:
            t = t.replace(cesure + "\n", "-\n").replace(cesure, "-\n")
    if not t.endswith("\n"):
        t += "\n"
    return t


# ─── Lecture ──────────────────────────────────────────────────────────────────

Source = Union[bytes, bytearray, memoryview, str, "os.PathLike[str]"]
T = TypeVar("T")


def lire_pages(source: Source, max_pages: Optional[int] = None) -> list[str]:
    """Texte de chaque page d'un PDF (octets ou chemin), pages vides comprises (chaîne vide).

    ``max_pages`` : seulement les N premières pages. Lève ``PdfIllisible`` si PDFium ne
    sait pas lire le fichier (``code`` 3 : corrompu, tronqué ou pas un PDF ; 4 : mot de
    passe d'ouverture ; 6 : sans page ou page illisible), ``OSError`` si le chemin ne se
    lit pas."""
    octets = _octets(source)          # lecture du fichier hors verrou
    with VERROU_PDFIUM:
        pdf, total = _ouvrir(octets)
    limite = min(max_pages, total) if max_pages else total
    textes: list[str] = []
    lourd = False
    try:
        for index in range(limite):
            texte, page_lourde = _avec_page(pdf, index, _texte_visible)
            textes.append(texte)
            lourd = lourd or page_lourde
    finally:
        with VERROU_PDFIUM:
            pdf.close()
        # `octets` reste référencé jusqu'ici : PDFium lit dans ce tampon jusqu'à la fermeture.
        if lourd:
            _rendre_la_memoire()
    return textes


def _octets(source: Source) -> bytes:
    if isinstance(source, bytes):
        return source
    if isinstance(source, (bytearray, memoryview)):
        return bytes(source)
    if isinstance(source, (str, os.PathLike)):
        return Path(source).read_bytes()
    raise TypeError(f"source PDF non prise en charge : {type(source).__name__}")


def _ouvrir(octets: bytes) -> tuple[pdfium.PdfDocument, int]:
    """(document, nombre de pages), sous VERROU_PDFIUM.

    Chargement brut, pour un code d'erreur exact : ``pdfium.PdfDocument(octets)`` lit
    ``FPDF_GetLastError()`` aussi quand le chargement a RÉUSSI sur un PDF sans page, et
    rend alors l'erreur précédente du processus (constaté : 4, « mot de passe »). Le
    document ne garde pas ``octets`` : l'appelant le garde jusqu'à la fermeture."""
    brut = pdfium_c.FPDF_LoadMemDocument64(octets, len(octets), None)
    if not brut:
        raise PdfIllisible(pdfium_c.FPDF_GetLastError())
    total = pdfium_c.FPDF_GetPageCount(brut)
    if total < 1:
        pdfium_c.FPDF_CloseDocument(brut)
        raise PdfIllisible(ERREUR_PAGE, "aucune page")
    return pdfium.PdfDocument(brut), total


def _avec_page(
    pdf: pdfium.PdfDocument,
    index: int,
    traitement: Callable[[pdfium.PdfPage, pdfium.PdfTextPage, frozenset], T],
) -> tuple[T, bool]:
    """``(traitement(page, textpage, masques), page lourde)`` pour la page ``index``, sous
    ``VERROU_PDFIUM``.

    Seule porte d'accès aux pages : le texte envoyé à l'IA et, plus tard, les positions du
    surligneur (sujet A : texte indexé par caractère, boîtes des caractères) passent par la
    MÊME lecture de la page — champs aplatis, même textpage, même filtre du texte masqué.
    ``masques`` : indices (dans l'ordre de ``FPDFText_CountChars``, celui de
    ``get_charbox``) des caractères cachés par un détourage. ``traitement`` est appelé sous
    le verrou et ne rend que des ``str``, des nombres ou des tuples, jamais un objet pdfium.
    Page lourde : plus de ``SEUIL_OBJETS`` objets, formulaires compris (filtre non appliqué).
    Tout est fermé ici."""
    with VERROU_PDFIUM:
        page = textpage = None
        try:
            page = _charger_page(pdf, index)
            detourages = (_detourages(page)
                          if pdfium_c.FPDFPage_CountObjects(page) <= SEUIL_OBJETS else None)
            textpage = page.get_textpage()
            masques = _caracteres_masques(page, textpage, detourages) if detourages else frozenset()
            return traitement(page, textpage, masques), detourages is None
        except pdfium.PdfiumError as e:
            raise PdfIllisible(ERREUR_PAGE, f"page {index + 1}") from e
        finally:
            if textpage is not None:
                textpage.close()
            if page is not None:
                page.close()


def _texte_visible(page: pdfium.PdfPage, textpage: pdfium.PdfTextPage, masques: frozenset) -> str:
    """Texte de la page sans les caractères masqués, normalisé (H §2.3 et §2.2)."""
    if not masques:
        return normaliser_texte_pdfium(textpage.get_text_bounded())
    morceaux, debut = [], None
    n = textpage.count_chars()
    for i in range(n + 1):
        visible = i < n and i not in masques
        if visible and debut is None:
            debut = i
        elif not visible and debut is not None:
            morceaux.append(textpage.get_text_range(debut, i - debut))
            debut = None
    return normaliser_texte_pdfium("\r\n".join(m for m in morceaux if m.strip()))


# ─── Champs de formulaire et annotations (H §2.4) ─────────────────────────────

def _charger_page(pdf: pdfium.PdfDocument, index: int) -> pdfium.PdfPage:
    """La page ``index``, champs de formulaire et annotations aplatis.

    PDFium ne lit pas le texte des champs (DT, CERFA remplis : annotations « Widget ») tant
    qu'il n'est pas dans le contenu de la page ; PyMuPDF, si (DT ORANGE p. 1 : 6 000 → 6 538
    caractères, PyMuPDF 6 670). ``FPDFPage_Flatten`` modifie la page EN MÉMOIRE (rien
    n'est écrit), puis la page est rechargée. Appel brut : ``page.flatten()`` exige
    ``init_forms()``, qui ne fait rien sans formulaire AcroForm. Une page qui n'a que des
    liens n'est pas aplatie : sans effet sur le texte (l'AE de Gueux a 19 liens par page)."""
    page = pdf[index]
    if not _annotations_hors_liens(page):
        return page
    if pdfium_c.FPDFPage_Flatten(page, pdfium_c.FLAT_NORMALDISPLAY) != pdfium_c.FLATTEN_SUCCESS:
        return page
    page.close()
    return pdf[index]


def _annotations_hors_liens(page: pdfium.PdfPage) -> bool:
    for k in range(pdfium_c.FPDFPage_GetAnnotCount(page)):
        annotation = pdfium_c.FPDFPage_GetAnnot(page, k)
        if not annotation:
            continue
        try:
            if pdfium_c.FPDFAnnot_GetSubtype(annotation) != pdfium_c.FPDF_ANNOT_LINK:
                return True
        finally:
            pdfium_c.FPDFPage_CloseAnnot(annotation)
    return False


# ─── Texte masqué par un détourage (H §2.3, filtre v2) ────────────────────────
# Une figure embarque la page d'un autre PDF (guide RAGE, fiche produit) et n'en montre
# qu'une partie : le reste est caché par un détourage (clip path). PDFium extrait ce texte
# invisible, PyMuPDF non (CCTP lot 02 de Gueux p. 9 : 508 mots chez PyMuPDF, 721 chez
# PDFium, 508 après le filtre). Un caractère dont le centre sort de la boîte de détourage
# EFFECTIVE de son objet texte (en coordonnées de page, formulaires imbriqués compris,
# matrices cumulées) est écarté.

_TOLERANCE = 1.0              # point PDF autour de la boîte de détourage
_MARGE_PAGE = 2.0             # un détourage qui couvre toute la page ne masque rien
_PROFONDEUR_MAX = 15          # formulaires imbriqués
_IDENTITE = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)

Boite = tuple[float, float, float, float]   # gauche, bas, droite, haut


def _composer(m1: tuple, m2: tuple) -> tuple:
    """m1 puis m2 (matrices PDF a b c d e f)."""
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return (a1 * a2 + b1 * c2, a1 * b2 + b1 * d2,
            c1 * a2 + d1 * c2, c1 * b2 + d1 * d2,
            e1 * a2 + f1 * c2 + e2, e1 * b2 + f1 * d2 + f2)


def _appliquer(m: tuple, x: float, y: float) -> tuple[float, float]:
    a, b, c, d, e, f = m
    return a * x + c * y + e, b * x + d * y + f


def _intersection(a: Optional[Boite], b: Optional[Boite]) -> Optional[Boite]:
    if a is None:
        return b
    if b is None:
        return a
    return max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])


def _boite_detourage(objet, matrice: tuple) -> Optional[Boite]:
    """Boîte du détourage de ``objet``, ramenée en coordonnées de page par ``matrice``."""
    detourage = pdfium_c.FPDFPageObj_GetClipPath(objet)
    if not detourage:
        return None
    xs, ys = [], []
    x, y = ctypes.c_float(), ctypes.c_float()
    for p in range(pdfium_c.FPDFClipPath_CountPaths(detourage)):
        for s in range(pdfium_c.FPDFClipPath_CountPathSegments(detourage, p)):
            segment = pdfium_c.FPDFClipPath_GetPathSegment(detourage, p, s)
            if segment and pdfium_c.FPDFPathSegment_GetPoint(segment, x, y):
                px, py = _appliquer(matrice, x.value, y.value)
                xs.append(px)
                ys.append(py)
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def _adresse(objet) -> int:
    return ctypes.cast(objet, ctypes.c_void_p).value


def _detourages(page: pdfium.PdfPage) -> Optional[dict[int, Boite]]:
    """{adresse d'un objet texte détouré : boîte de détourage effective, en coordonnées de
    page}. None si la page compte plus de ``SEUIL_OBJETS`` objets, formulaires compris : le
    parcours coûterait trop cher."""
    boites: dict[int, Boite] = {}
    reste = SEUIL_OBJETS

    def parcourir(conteneur, est_page: bool, matrice: tuple, detourage: Optional[Boite], profondeur: int) -> bool:
        nonlocal reste
        if est_page:
            n = pdfium_c.FPDFPage_CountObjects(conteneur)
        else:
            n = pdfium_c.FPDFFormObj_CountObjects(conteneur)
        reste -= max(n, 0)
        if reste < 0:
            return False
        for k in range(n):
            if est_page:
                objet = pdfium_c.FPDFPage_GetObject(conteneur, k)
            else:
                objet = pdfium_c.FPDFFormObj_GetObject(conteneur, k)
            if not objet:
                continue
            genre = pdfium_c.FPDFPageObj_GetType(objet)
            if genre == pdfium_c.FPDF_PAGEOBJ_TEXT:
                boite = _intersection(detourage, _boite_detourage(objet, matrice))
                if boite is not None:
                    boites[_adresse(objet)] = boite
            elif genre == pdfium_c.FPDF_PAGEOBJ_FORM and profondeur < _PROFONDEUR_MAX:
                fm = pdfium_c.FS_MATRIX()
                pdfium_c.FPDFPageObj_GetMatrix(objet, fm)
                matrice_forme = _composer((fm.a, fm.b, fm.c, fm.d, fm.e, fm.f), matrice)
                detourage_forme = _intersection(detourage, _boite_detourage(objet, matrice))
                if not parcourir(objet, False, matrice_forme, detourage_forme, profondeur + 1):
                    return False
        return True

    return boites if parcourir(page.raw, True, _IDENTITE, None, 0) else None


def _caracteres_masques(page: pdfium.PdfPage, textpage: pdfium.PdfTextPage,
                        detourages: dict[int, Boite]) -> frozenset:
    """Indices des caractères dont le centre sort de la boîte de détourage de leur objet."""
    g0, b0, d0, h0 = page.get_bbox()
    serrees = {cle: bb for cle, bb in detourages.items()
               if not (bb[0] <= g0 + _MARGE_PAGE and bb[1] <= b0 + _MARGE_PAGE
                       and bb[2] >= d0 - _MARGE_PAGE and bb[3] >= h0 - _MARGE_PAGE)}
    if not serrees:
        return frozenset()
    masques = set()
    g, d, b, h = ctypes.c_double(), ctypes.c_double(), ctypes.c_double(), ctypes.c_double()
    for i in range(textpage.count_chars()):
        if pdfium_c.FPDFText_IsGenerated(textpage, i) == 1:
            continue
        objet = pdfium_c.FPDFText_GetTextObject(textpage, i)
        if not objet:
            continue
        bb = serrees.get(_adresse(objet))
        if bb is None or not pdfium_c.FPDFText_GetCharBox(textpage, i, g, d, b, h):
            continue
        cx, cy = (g.value + d.value) / 2, (b.value + h.value) / 2
        if not (bb[0] - _TOLERANCE <= cx <= bb[2] + _TOLERANCE
                and bb[1] - _TOLERANCE <= cy <= bb[3] + _TOLERANCE):
            masques.add(i)
    return frozenset(masques)


# ─── Mémoire (H §3.3) ─────────────────────────────────────────────────────────

_LIBC: Optional[ctypes.CDLL] = None


def _rendre_la_memoire() -> None:
    """Rend au système la mémoire libérée par PDFium. Après un plan vectoriel lourd, glibc
    la garde : 585 Mo mesurés sur Gueux (sans fuite) ; ``malloc_trim(0)`` la rend (43 Mo).
    Sans glibc (macOS, musl) : rien."""
    global _LIBC
    try:
        if _LIBC is None:
            _LIBC = ctypes.CDLL("libc.so.6")
        _LIBC.malloc_trim(0)
    except (OSError, AttributeError):
        pass
