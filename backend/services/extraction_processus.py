"""Extraction des pièces du DCE dans le PROCESSUS pdfium (services/pdfium_processus.py).

Par défaut (T9, sprint Ozcan), toute pièce déposée est lue hors de l'API : PDFium n'est pas
thread-safe, un PDF piégé peut le faire monter de plusieurs Go (rapport G : 330 Ko → 6 Go) et
un plantage natif emporterait l'API. Le processus est UNIQUE (KVM 1 : 1 vCPU, 4 Go), recyclé,
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
# les 93 pièces de Gueux, dont le DT SIEM de 83 Mo, se lisent chacune en moins de 15 s sur
# disque local. Le socle couvre un disque lent ; le plafond évite qu'un fichier piégé occupe
# l'unique processus plus de 15 minutes.
DELAI_BASE_S = 120.0
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
        sur_progression=(lambda p: on_page(*p)) if on_page is not None else None,
    )


def avertissement_travail(nom: str, echec: "pdfium_processus.TravailPdfiumEchoue") -> str:
    """Avertissement de la pièce quand sa lecture a été interrompue (affiché à côté du fichier)."""
    cause = "trop longue" if echec.raison == "delai" else "fichier trop lourd ou abîmé"
    return (f"« {nom} » : lecture interrompue ({cause}) — "
            "texte non extrait de ce fichier")
