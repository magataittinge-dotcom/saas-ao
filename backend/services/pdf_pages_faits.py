"""Page d'un fait dans un PDF, en écartant les pages de sommaire (V1, suite de R14).

Fonction exécutée DANS le processus PDFium (``services/pdfium_processus``) : aucune base,
aucun modèle, seulement des ``dict`` et des nombres en entrée et en sortie.

L'extrait d'un champ critique est parfois pris dans le sommaire (« 5. JUGEMENT DES OFFRES …… 12 ») :
la page trouvée est alors celle du sommaire, pas celle du fait. Une page de sommaire est écartée, et
la page est cherchée là où le contenu du fait se trouve (les termes tirés de sa valeur).
"""
from __future__ import annotations

import re
import unicodedata
from typing import Iterable, Optional

from services import pdf_positions as pp
from services.pdf_ancre import construire_ancre

_POINTS_DE_CONDUITE = re.compile(r"\.{5,}\s*\d{1,3}\b|(?:\. ){5,}\s*\d{1,3}\b|…{3,}\s*\d{1,3}\b")
_LIGNE_A_NUMERO = re.compile(r"(?m)\S[^\n]{6,}\s\d{1,3}[ \t]*$")
_TITRE_SOMMAIRE = re.compile(r"sommaire|table des mati[eè]res", re.IGNORECASE)


def normaliser(texte: str) -> str:
    sans = "".join(c for c in unicodedata.normalize("NFKD", (texte or "").lower()) if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sans.replace("’", "'"))


def est_sommaire(texte: str) -> bool:
    """Page de sommaire : lignes de titres suivies de points de conduite et d'un numéro de page, ou
    sommaire annoncé par son titre et dont les lignes finissent par un numéro de page."""
    if len(_POINTS_DE_CONDUITE.findall(texte or "")) >= 3:
        return True
    return bool(_TITRE_SOMMAIRE.search((texte or "")[:600])) and len(_LIGNE_A_NUMERO.findall(texte or "")) >= 4


def _texte(pdf: pp.LecturePdf, n: int) -> str:
    page = pdf.page(n)
    return (page.texte if page else "") or ""


def _contient_un(pdf: pp.LecturePdf, n: int, requis: Optional[Iterable[str]]) -> bool:
    mots = [normaliser(m) for m in (requis or []) if m]
    if not mots:
        return True
    texte = normaliser(_texte(pdf, n))
    return any(m in texte for m in mots)


def meilleure_page(pdf: pp.LecturePdf, termes: Iterable[str], exclues: set[int]) -> Optional[int]:
    """Numéro (à partir de 1) de la page, hors sommaires, qui contient le plus de termes ; la première en cas
    d'égalité ; None si aucune page n'en contient un seul."""
    termes = [normaliser(t) for t in termes if t and normaliser(t)]
    if not termes:
        return None
    meilleur, score_max = None, 0
    for n in range(pdf.nombre_pages):
        if n in exclues:
            continue
        texte = normaliser(_texte(pdf, n))
        score = sum(1 for t in termes if t in texte)
        if score > score_max:
            meilleur, score_max = n + 1, score
    return meilleur


def localiser_pages(source, doc_id: str, demandes: Iterable[dict]) -> dict[str, Optional[int]]:
    """``demandes`` : des ``{"id", "extrait", "termes", "requis"}``. Rend ``{id: page (à partir de 1) ou None}``.
    Une page trouvée par l'extrait est gardée, sauf si c'est un sommaire ou si elle ne contient aucun des mots
    ``requis`` du fait (extrait pris dans un tableau sans rapport) ; la page est alors celle qui contient le
    mieux les ``termes`` du fait, hors sommaires, ou à défaut la page trouvée. Jamais d'exception par demande."""
    resultat: dict[str, Optional[int]] = {}
    with pp.ouvrir(source) as pdf:
        sommaires = {n for n in range(pdf.nombre_pages) if est_sommaire(_texte(pdf, n))}
        for d in demandes:
            page: Optional[int] = None
            try:
                ancre = construire_ancre(pdf, doc_id, None, d.get("extrait"))
                page = int(ancre["page"]) if ancre and ancre.get("page") else None
                if page is not None and ((page - 1) in sommaires or not _contient_un(pdf, page - 1, d.get("requis"))):
                    page = meilleure_page(pdf, d.get("termes") or [], sommaires) or (
                        None if (page - 1) in sommaires else page)
            except Exception:
                page = None
            resultat[d["id"]] = page
    return resultat
