"""Extraction des pièces du DCE dans le PROCESSUS pdfium (services/pdfium_processus.py).

Par défaut (T9, sprint Ozcan), toute pièce déposée est lue hors de l'API : PDFium n'est pas
thread-safe, un PDF piégé peut le faire monter de plusieurs Go (rapport G : 330 Ko → 6 Go) et
un plantage natif emporterait l'API. Le processus est UNIQUE par défaut (valeur du code ; 2 sur le KVM 2 de production, 2 vCPU et 8 Go, posé par l'unité systemd), recyclé,
plafonné en mémoire (``RLIMIT_AS``) et chaque pièce a un délai. Les threads de l'appelant ne
font qu'attendre et écrire en base.

- Le processus de travail lit le fichier lui-même (pas d'octets à transmettre) et renvoie
  (texte, pages, avertissement, textes de toutes les pages).
- L'avancement page par page remonte par ``pdfium_processus.signaler`` (un message toutes les
  3 pages au plus).
- À la panne du travail (délai, plafond de mémoire, plantage), la pièce est « non lisible » :
  ``avertissement_travail`` donne le message, qui la nomme. On ne relit JAMAIS dans l'API une
  pièce qui vient de faire tomber le processus.
- SYNORIX_EXTRACTION_PROCESSUS=0 revient à l'extraction en threads dans l'API (diagnostic
  seulement, sans protection). Toute autre valeur garde le processus ; le NOMBRE de processus
  se règle ailleurs (SYNORIX_PDFIUM_PROCESSUS, 1 par défaut).
- ATTENTION (contexte spawn) : tout script qui déclenche l'extraction dans son propre processus
  doit protéger son code par `if __name__ == "__main__":`.
"""
from __future__ import annotations

import logging
import os
from typing import Callable, Optional, Tuple

from services import pdfium_processus

logger = logging.getLogger(__name__)

# Délai de lecture d'une pièce : socle + part proportionnelle à la taille. Mesuré (banc T9) :
# les 99 pièces de Gueux, dont le DT SIEM de 83 Mo, se lisent chacune en moins de 7 s (disque
# lent de WSL compris). Le socle court (30 s) empêche qu'un petit fichier piégé tienne l'unique
# processus longtemps et fasse attendre les autres organisations ; la part par Mo laisse 280 s
# au DT de 83 Mo ; le plafond borne tout fichier à 15 minutes.
DELAI_BASE_S = 30.0
DELAI_PAR_MO_S = 3.0
DELAI_MAX_S = 900.0


def actif() -> bool:
    """Vrai (défaut) : extraction dans le processus pdfium. ``SYNORIX_EXTRACTION_PROCESSUS=0``
    : threads dans l'API, comme avant."""
    return os.environ.get("SYNORIX_EXTRACTION_PROCESSUS", "1").strip() != "0"


def delai_extraction_s(chemin: str) -> float:
    try:
        mo = os.path.getsize(chemin) / (1024 * 1024)
    except OSError:
        mo = 0.0
    return min(DELAI_MAX_S, DELAI_BASE_S + DELAI_PAR_MO_S * mo)


def extraire_fichier(chemin: str, nom: str, doc_id: str):
    """Exécuté dans le processus pdfium : (texte, pages, avertissement, pages_toutes)."""
    from services.document_processor import DocumentProcessor

    pages_toutes: list = []
    derniere = [0]

    def page_lue(fait: int, total: int) -> None:
        if fait == total or fait - derniere[0] >= 3:
            derniere[0] = fait
            pdfium_processus.signaler((fait, total))

    # par le chemin : un gros fichier est lu au fil de l'eau, jamais chargé en entier
    texte, pages, avertissement = DocumentProcessor().extract_ex(
        chemin, nom, on_page=page_lue, on_pages=pages_toutes.extend)
    return texte, pages, avertissement, (pages_toutes or None)


def extraire_en_processus(
    chemin: str, nom: str, doc_id: str,
    on_page: Optional[Callable[[int, int], None]] = None,
) -> Tuple[str, Optional[int], Optional[str], Optional[list]]:
    """``extraire_fichier`` dans le processus pdfium ; ``on_page(fait, total)`` est appelé
    dans le thread de l'appelant. Lève ``pdfium_processus.TravailPdfiumEchoue`` (délai,
    plafond de mémoire, plantage)."""
    return pdfium_processus.executer(
        extraire_fichier, str(chemin), nom, doc_id,
        delai_s=delai_extraction_s(str(chemin)),
        attente_s=pdfium_processus.attente_extraction_s(),
        sur_progression=(lambda p: on_page(*p)) if on_page is not None else None,
    )


def lire_pages_pdf(chemin: str, max_pages: Optional[int]) -> list:
    """Exécuté dans le processus pdfium : textes des pages d'un PDF (toutes, ou les ``max_pages``
    premières). PDFium d'abord ; pour les premières pages seulement, ``pypdf`` en repli si PDFium
    ne lit pas le fichier (décompression plafonnée à 75 Mo par pypdf >= 6, et le processus a de
    toute façon son plafond de mémoire). Lève ``PdfIllisible`` sans repli possible."""
    from services import pdf_lecture
    try:
        if max_pages is None:
            return list(pdf_lecture.lire_pages(chemin))
        return list(pdf_lecture.lire_pages(chemin, max_pages=max_pages))
    except Exception:
        if max_pages is None:
            raise
    import pypdf
    with open(chemin, "rb") as f:
        lecteur = pypdf.PdfReader(f)
        pages = []
        for i in range(min(len(lecteur.pages), max_pages)):
            pages.append(lecteur.pages[i].extract_text() or "")
        return pages


def pages_pdf(chemin, max_pages: Optional[int] = None) -> list:
    """Textes des pages d'un PDF DÉPOSÉ, lus hors de l'API (``lire_pages_pdf`` dans le processus
    pdfium : plafond de mémoire, délai). Lève ``pdfium_processus.TravailPdfiumEchoue`` (délai,
    mémoire, plantage, attente) : l'appelant ne relit JAMAIS le fichier dans l'API.
    ``SYNORIX_EXTRACTION_PROCESSUS=0`` : lecture directe (diagnostic, tests)."""
    if not actif():
        return lire_pages_pdf(str(chemin), max_pages)
    return pdfium_processus.executer(
        lire_pages_pdf, str(chemin), max_pages,
        delai_s=delai_extraction_s(str(chemin)),
        attente_s=pdfium_processus.attente_extraction_s())


def texte_pdf(chemin, nom: str) -> str:
    """Texte complet d'un PDF déposé (import d'un mémoire existant), lu dans le processus pdfium."""
    return pdfium_processus.executer(
        extraire_fichier, str(chemin), nom, "",
        delai_s=delai_extraction_s(str(chemin)),
        attente_s=pdfium_processus.attente_interactive_s())[0]


def avertissement_travail(nom: str, echec: "pdfium_processus.TravailPdfiumEchoue") -> str:
    """Avertissement de la pièce quand sa lecture a été interrompue (affiché à côté du fichier)."""
    if echec.raison == "attente":
        return (f"« {nom} » : lecture reportée (serveur occupé) — "
                "texte non extrait de ce fichier, redéposez-le dans quelques minutes")
    cause = "trop longue" if echec.raison == "delai" else "fichier trop lourd ou abîmé"
    return (f"« {nom} » : lecture interrompue ({cause}) — "
            "texte non extrait de ce fichier")
