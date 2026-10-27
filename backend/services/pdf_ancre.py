"""Ancre d'une exigence dans un PDF — sujet A (« Voir dans le DCE »), tranche A2.

Entrée : l'extrait que l'analyse a cité pour une exigence et la page qu'elle indique.
Sortie : l'ancre, un petit JSON stocké avec l'exigence ::

    {"version": 1, "doc_id": "...", "page": 7, "rotation": 0,
     "rects": [[x0, y0, x1, y1], ...], "niveau": "passage" | "page",
     "citation": {"avant": "...", "passage": "...", "apres": "..."},
     "suite": {"page": 8, "rotation": 0, "rects": [...]}}      # passage à cheval seulement

``page`` : numéro à partir de 1 ; ``rects`` : fractions du cadre visible, origine en haut à
gauche, dans la page NON tournée (``pdf_positions``) ; ``rotation`` : celle de la page, que
l'affichage applique. ``niveau`` « page » : pas de rectangles, l'écran dit « Page citée par
l'analyse ». ``suite`` : un passage à cheval sur deux pages garde ses rectangles de la page
suivante.

Règles d'honnêteté (A §5) : jamais de devinette.
- On ne surligne que le PASSAGE ENTIER, d'un seul tenant, sur sa page ou à cheval sur deux
  pages consécutives. Jamais un morceau, jamais « ligne par ligne » (un bout court comme
  « d'étanchéité » se colle ailleurs sur la page).
- La comparaison se fait sur le flux alphanumérique (lettres et chiffres, sans accents ni
  casse) : blancs, ponctuation, césures n'y comptent pas.
- Ordre de recherche : la page donnée, puis ses deux voisines, puis le document. Dans le
  document, le passage n'est retenu que s'il n'y figure qu'à un seul endroit.
- Un passage trop court pour être unique (4 à 11 lettres : un mot, un sigle) n'est surligné
  que sur la page donnée, mot entier, et s'il y figure 1 à 3 fois. En dessous de 4 lettres,
  ou sinon : niveau « page ».
- Sans page valable et sans passage trouvé : pas d'ancre (None).

Pour un PDF, ``calculer_ancres`` fait tout en une seule ouverture du fichier : c'est la
fonction qu'exécute le processus PDFium (``services/pdfium_processus.py``).
"""
from __future__ import annotations

import re
from typing import Iterable, NamedTuple, Optional

from services import pdf_positions as pp

__all__ = [
    "MIN_FLUX_PASSAGE",
    "MIN_FLUX_MOT",
    "MAX_OCCURRENCES_MOT",
    "VERSION",
    "Trouve",
    "calculer_ancres",
    "chercher_passage",
    "construire_ancre",
]

VERSION = 1
MIN_FLUX_PASSAGE = 12      # lettres et chiffres : en dessous, trop court pour être unique
MIN_FLUX_MOT = 4           # en dessous, jamais surligné
MAX_OCCURRENCES_MOT = 3

_CONTEXTE_MAX = 300        # caractères de la page lus avant et après le passage


class Trouve(NamedTuple):
    """Où est le passage : pages à partir de 0, index de ``PageTexte.texte``."""

    page: int
    debut: int
    fin: int                                  # inclus
    suite: Optional[tuple[int, int]] = None   # (page suivante, fin inclus) si à cheval
    autres: tuple[tuple[int, int], ...] = ()  # mot isolé : les autres occurrences (debut, fin)


# ─── Recherche ────────────────────────────────────────────────────────────────

def _dans_la_page(page: pp.PageTexte, flux: str) -> Optional[Trouve]:
    k = page.flux.find(flux)
    if k < 0:
        return None
    return Trouve(page.index, page.origine[k], page.origine[k + len(flux) - 1])


def _a_cheval(page: pp.PageTexte, suivante: Optional[pp.PageTexte], flux: str) -> Optional[Trouve]:
    """Le passage commence à la fin de ``page`` et finit au début de ``suivante``."""
    if suivante is None:
        return None
    for coupe in range(1, len(flux)):
        if page.flux.endswith(flux[:coupe]) and suivante.flux.startswith(flux[coupe:]):
            debut = page.origine[len(page.flux) - coupe]
            fin = suivante.origine[len(flux) - coupe - 1]
            return Trouve(page.index, debut, len(page.texte) - 1, (suivante.index, fin))
    return None


def _essai(pdf: pp.LecturePdf, n: int, flux: str) -> Optional[Trouve]:
    page = pdf.page(n)
    if page is None:
        return None
    return _dans_la_page(page, flux) or _a_cheval(page, pdf.page(n + 1), flux)


def _mot_entier(texte: str, debut: int, fin: int) -> bool:
    avant = texte[debut - 1] if debut > 0 else " "
    apres = texte[fin + 1] if fin + 1 < len(texte) else " "
    return not avant.isalnum() and not apres.isalnum()


def _occurrences_mot(page: pp.PageTexte, flux: str) -> list[tuple[int, int]]:
    trouvees, k = [], page.flux.find(flux)
    while k >= 0:
        debut, fin = page.origine[k], page.origine[k + len(flux) - 1]
        if _mot_entier(page.texte, debut, fin):
            trouvees.append((debut, fin))
        k = page.flux.find(flux, k + 1)
    return trouvees


def chercher_passage(pdf: pp.LecturePdf, page_ia: Optional[int], extrait: str) -> Optional[Trouve]:
    """Le passage ``extrait`` dans le PDF, ou None. ``page_ia`` : numéro à partir de 1."""
    flux, _ = pp.forme_flux(extrait)
    n0 = page_ia - 1 if page_ia and 1 <= page_ia <= pdf.nombre_pages else None
    if len(flux) < MIN_FLUX_MOT:
        return None
    if len(flux) < MIN_FLUX_PASSAGE:
        # un mot, un sigle : seulement sur la page donnée, mot entier, 1 à 3 fois
        page = pdf.page(n0) if n0 is not None else None
        occurrences = _occurrences_mot(page, flux) if page is not None else []
        if 1 <= len(occurrences) <= MAX_OCCURRENCES_MOT:
            (debut, fin), *autres = occurrences
            return Trouve(n0, debut, fin, None, tuple(autres))
        return None
    if n0 is not None:
        for n in (n0, n0 - 1, n0 + 1):
            trouve = _essai(pdf, n, flux)
            if trouve:
                return trouve
    # le document entier : retenu seulement s'il n'y a qu'un endroit
    endroits = [t for n in range(pdf.nombre_pages)
                if n0 is None or abs(n - n0) > 1
                for t in [_essai(pdf, n, flux)] if t]
    return endroits[0] if len(endroits) == 1 else None


# ─── Citation ─────────────────────────────────────────────────────────────────

# Fin de paragraphe : ponctuation finale puis saut de ligne, ligne blanche, ou début
# d'une puce / d'un numéro d'article.
_FIN_PARAGRAPHE = re.compile(
    r"(?<=[.!?;:])[ \t]*\r?\n|\n[ \t]*\r?\n|\n(?=[ \t]*(?:[-•◼▪●]\s|\d+(?:\.\d+)*[.)]?\s))")
_FIN_PHRASE = re.compile(r"[.!?;:](?=\s|$)")


def _nettoyer(texte: str) -> str:
    """Texte lisible : masqués retirés, césure rendue par un trait d'union, lignes recollées."""
    texte = texte.replace(pp.MASQUE, "").replace(pp.CESURE, "-")
    texte = "".join(c if c.isprintable() or c in "\r\n\t" else "" for c in texte)
    return " ".join(texte.split())


def _bords(extrait: str) -> tuple[int, int]:
    """(devant, derrière) : combien de signes (ni lettre, ni chiffre, ni blanc) l'extrait a
    en tête et en queue — « (AE) » : 1 et 1."""
    def signe(c: str) -> bool:
        return not c.isalnum() and not c.isspace()

    texte = extrait.strip()
    devant = derriere = 0
    while devant < len(texte) and signe(texte[devant]):
        devant += 1
    while derriere < len(texte) - devant and signe(texte[len(texte) - 1 - derriere]):
        derriere += 1
    return devant, derriere


def _etendre(texte: str, debut: int, fin: int, devant: int, derriere: int) -> tuple[int, int]:
    """Inclut la ponctuation de bord que l'extrait porte et que la comparaison en flux n'a
    pas vue : « (AE) », « 5 % », « l'article. ». Seulement des signes collés au passage."""
    def signe(i: int) -> bool:
        return 0 <= i < len(texte) and not texte[i].isalnum() and not texte[i].isspace() \
            and texte[i] not in (pp.CESURE, pp.MASQUE)

    for _ in range(devant):
        if not signe(debut - 1):
            break
        debut -= 1
    for _ in range(derriere):
        if not signe(fin + 1):
            break
        fin += 1
    return debut, fin


def _avant(texte: str, debut: int) -> str:
    depart = max(0, debut - _CONTEXTE_MAX)
    fenetre = texte[depart:debut].replace("\r\n", "\n").replace("\r", "\n")
    if depart == 0:
        # le contexte touche le haut de la page : sa première ligne est l'en-tête
        premiere = fenetre.find("\n")
        fenetre = fenetre[premiere + 1:] if premiere >= 0 else ""
    coupes = list(_FIN_PARAGRAPHE.finditer(fenetre))
    if coupes:
        fenetre = fenetre[coupes[-1].end():]
    elif depart > 0:
        # coupé par la fenêtre, pas par un paragraphe : repartir d'un mot entier
        espace = fenetre.find(" ")
        fenetre = fenetre[espace + 1:] if espace >= 0 else fenetre
    return _nettoyer(fenetre)


def _apres(texte: str, fin: int) -> str:
    fenetre = texte[fin + 1:fin + 1 + _CONTEXTE_MAX].replace("\r\n", "\n").replace("\r", "\n")
    coupe = _FIN_PHRASE.search(fenetre)
    if coupe:
        fenetre = fenetre[:coupe.end()]
    return _nettoyer(fenetre)


def _citation(pdf: pp.LecturePdf, t: Trouve, debut: int, fin: int) -> dict:
    """``fin`` : dernier caractère du passage, sur sa page (ou sur la page suivante si le
    passage est à cheval, ``t.suite``)."""
    page = pdf.page(t.page)
    if t.suite is None:
        passage = _nettoyer(page.texte[debut:fin + 1])
        apres = _apres(page.texte, fin)
    else:
        suivante = pdf.page(t.suite[0])
        passage = _nettoyer(page.texte[debut:] + " " + suivante.texte[:fin + 1])
        apres = _apres(suivante.texte, fin)
    return {"avant": _avant(page.texte, debut), "passage": passage, "apres": apres}


# ─── Ancre ────────────────────────────────────────────────────────────────────

def _ancre_page(doc_id: str, numero: int, rotation: int) -> dict:
    return {"version": VERSION, "doc_id": doc_id, "page": numero, "rotation": rotation,
            "rects": [], "niveau": "page", "citation": None}


def construire_ancre(pdf: pp.LecturePdf, doc_id: str, page_ia: Optional[int],
                     extrait: Optional[str]) -> Optional[dict]:
    """L'ancre de l'extrait dans ce PDF, ou None (aucune page valable, aucun passage)."""
    page_valide = bool(page_ia) and 1 <= page_ia <= pdf.nombre_pages
    trouve = chercher_passage(pdf, page_ia, extrait) if extrait and extrait.strip() else None
    if trouve is None:
        if not page_valide:
            return None
        lue = pdf.page(page_ia - 1)
        return _ancre_page(doc_id, page_ia, lue.rotation if lue else 0)

    page = pdf.page(trouve.page)
    devant, derriere = _bords(extrait)
    ancre = {"version": VERSION, "doc_id": doc_id, "page": trouve.page + 1,
             "rotation": page.rotation, "niveau": "passage"}
    if trouve.suite is None:
        debut, fin = _etendre(page.texte, trouve.debut, trouve.fin, devant, derriere)
        ancre["rects"] = pdf.rectangles(trouve.page, debut, fin)
        for autre_debut, autre_fin in trouve.autres:
            ancre["rects"] += pdf.rectangles(
                trouve.page, *_etendre(page.texte, autre_debut, autre_fin, devant, derriere))
    else:
        suivante = pdf.page(trouve.suite[0])
        debut, _ = _etendre(page.texte, trouve.debut, trouve.fin, devant, 0)
        _, fin = _etendre(suivante.texte, 0, trouve.suite[1], 0, derriere)
        ancre["rects"] = pdf.rectangles(trouve.page, debut, len(page.texte) - 1)
        ancre["suite"] = {"page": trouve.suite[0] + 1, "rotation": suivante.rotation,
                          "rects": pdf.rectangles(trouve.suite[0], 0, fin)}
    if not ancre["rects"] and "suite" not in ancre:
        # texte trouvé mais sans boîte lisible : jamais de surlignage inventé
        return _ancre_page(doc_id, trouve.page + 1, page.rotation)
    ancre["citation"] = _citation(pdf, trouve, debut, fin)
    return ancre


def calculer_ancres(source, doc_id: str, demandes: Iterable[dict]) -> dict[str, Optional[dict]]:
    """Les ancres de toutes les exigences d'une pièce PDF, en UNE ouverture du fichier.

    ``demandes`` : des ``{"id", "page", "extrait"}``. Rend ``{id: ancre ou None}``. Une
    exigence dont le calcul échoue donne None, jamais d'exception. Lève ``PdfIllisible``
    (``pdf_lecture``) si le PDF lui-même ne s'ouvre pas, ``OSError`` pour un chemin absent."""
    resultat: dict[str, Optional[dict]] = {}
    with pp.ouvrir(source) as pdf:
        for demande in demandes:
            try:
                resultat[demande["id"]] = construire_ancre(
                    pdf, doc_id, demande.get("page"), demande.get("extrait"))
            except Exception:
                resultat[demande["id"]] = None
    return resultat
