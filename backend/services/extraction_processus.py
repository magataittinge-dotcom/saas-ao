"""Extraction des pièces du DCE dans des PROCESSUS séparés.

PyMuPDF garde le GIL : en threads, l'extraction n'allait pas plus vite à 8 threads
qu'à 2 (mesuré : 17,2 s contre 19,5 s sur Gueux) et affamait le reste du processus —
la détection des lots passait de 2,5 s seule à 26-77 s pendant l'extraction de fond,
et la boucle de l'API ralentissait. Ici, chaque pièce est lue dans un processus de
travail ; les threads de l'appelant ne font qu'attendre (sans tenir le GIL) et
écrire en base.

- Contexte « spawn » (jamais de fork d'un processus qui a des threads).
- Le processus de travail lit le fichier lui-même (pas d'octets à transmettre) et
  renvoie (texte, pages, avertissement, textes de toutes les pages).
- L'avancement page par page remonte par une file (doc_id, nom, page, total).
- DÉSACTIVÉ PAR DÉFAUT (nuit du 23/10, en attente de validation) : extraction en
  threads, comme avant. SYNORIX_EXTRACTION_PROCESSUS=<n> active n processus (2 ou 4).
  Mesuré à vide sur Gueux : lots 6,6 s → 3,3 s (2 processus), extraction « prête »
  6,3 s → 4,1 s (4 processus) ; un plantage natif de PyMuPDF n'emporte plus l'API.
- Si le pool ne démarre pas (environnement restreint), l'appelant reste en threads.
- ATTENTION (contexte spawn) : tout script qui déclenche l'extraction dans son propre
  processus doit protéger son code par `if __name__ == "__main__":`, sinon chaque
  processus de travail ré-exécute le script (constaté avec un script de banc).
  uvicorn, Celery et pytest le font déjà.
"""
from __future__ import annotations

import logging
import multiprocessing as mp
import os
from concurrent.futures import ProcessPoolExecutor
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

_DEFAUT = 0   # désactivé tant que ce n'est pas validé (voir ci-dessus)
_progression = None   # dans le processus de travail : file des avancements


def _initialiser(file) -> None:
    global _progression
    _progression = file


def extraire_fichier(chemin: str, nom: str, doc_id: str):
    """Exécuté dans un processus de travail : (texte, pages, avertissement, pages_toutes)."""
    from services.document_processor import DocumentProcessor

    with open(chemin, "rb") as f:
        contenu = f.read()
    pages_toutes: list = []
    derniere = [0]

    def page_lue(fait: int, total: int) -> None:
        if _progression is not None and (fait == total or fait - derniere[0] >= 3):
            derniere[0] = fait
            try:
                _progression.put_nowait((doc_id, nom, fait, total))
            except Exception:
                pass  # l'avancement ne casse jamais l'extraction

    texte, pages, avertissement = DocumentProcessor().extract_ex(
        contenu, nom, on_page=page_lue, on_pages=pages_toutes.extend)
    return texte, pages, avertissement, (pages_toutes or None)


def nombre_de_processus() -> int:
    """0 = extraction en threads (comme avant) ; valeur illisible = 0."""
    valeur = os.environ.get("SYNORIX_EXTRACTION_PROCESSUS", str(_DEFAUT)).strip()
    try:
        return max(0, int(valeur))
    except ValueError:
        return _DEFAUT


def creer_pool() -> Tuple[Optional[ProcessPoolExecutor], Optional[object]]:
    """(pool, file d'avancement), ou (None, None) : désactivé ou impossible ici."""
    nb = nombre_de_processus()
    if nb == 0:
        return None, None
    try:
        ctx = mp.get_context("spawn")
        file = ctx.Queue()
        pool = ProcessPoolExecutor(max_workers=nb, mp_context=ctx,
                                   initializer=_initialiser, initargs=(file,))
        return pool, file
    except Exception as e:  # noqa: BLE001 — /dev/shm absent, limites système…
        logger.warning("Extraction en processus impossible (%s) : threads", e)
        return None, None
