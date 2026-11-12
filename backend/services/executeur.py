"""R-04 — l'exécuteur de `asyncio.to_thread`, posé au démarrage de l'API : nommé et borné.

Par défaut, asyncio prend `min(32, cpu + 4)` fils : **5 sur le serveur à 1 vCPU**, partagés par tous les `to_thread`
(appels courts à l'IA de 10 à 60 s : réécriture, points à éclaircir, import, pré-vol ; copies vers le coffre ; aperçus
PDF). Cinq appels d'IA simultanés faisaient attendre les aperçus et les dépôts de tous les clients. Ces fils attendent
le réseau ou un processus PDFium, pas le CPU : `SYNORIX_FILS_TO_THREAD` (16 par défaut, borné à 64).
"""
from __future__ import annotations

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

DEFAUT = 16
MAXIMUM = 64


def taille() -> int:
    brut = (os.environ.get("SYNORIX_FILS_TO_THREAD") or "").strip()
    try:
        valeur = int(brut) if brut else DEFAUT
    except ValueError:
        logger.warning("SYNORIX_FILS_TO_THREAD illisible : %s par défaut", DEFAUT)
        return DEFAUT
    if valeur < 1:
        return DEFAUT
    return min(valeur, MAXIMUM)


def installer(loop: asyncio.AbstractEventLoop | None = None) -> ThreadPoolExecutor:
    """Pose l'exécuteur par défaut de la boucle (celle qui tourne si `loop` est omis) et le rend."""
    boucle = loop or asyncio.get_running_loop()
    pool = ThreadPoolExecutor(max_workers=taille(), thread_name_prefix="synorix-to-thread")
    boucle.set_default_executor(pool)
    logger.info("Exécuteur de to_thread : %d fils", pool._max_workers)
    return pool


@asynccontextmanager
async def cycle_de_vie(_app):
    """`lifespan` de l'application : l'exécuteur est posé avant la première requête."""
    installer()
    yield
