"""Durcissement du processus : `PR_SET_DUMPABLE = 0` (bloc 6, alerte sécurité).

LibreOffice et les lecteurs de PDF tournent sous le MÊME utilisateur Unix que l'API. Le fichier
``/proc/<pid de l'API>/environ`` est lisible par tout processus du même utilisateur (accès « READ »,
que ``kernel.yama.ptrace_scope=1`` ne bloque pas : Yama ne limite que l'attache) ; or l'environnement
de l'API contient tous les secrets, chargés par ``EnvironmentFile`` de systemd. L'environnement
minimal donné à LibreOffice ne protégerait donc rien.

Un processus « non vidable » (``PR_SET_DUMPABLE = 0``) voit ses entrées ``/proc/<pid>/environ``,
``mem``, ``maps``, ``fd`` passer à root : un processus du même utilisateur ne les lit plus. L'indicateur
est remis à 1 par ``execve`` : LibreOffice et l'enfant PDFium (lancés par exec) ne sont pas touchés,
et lisent encore leur propre ``/proc/self``.

Effets de bord (mesurés, tests/test_durcissement.py) : plus de fichier core ; ``py-spy`` ou ``gdb`` ne
peuvent plus s'attacher sans root ; le processus lui-même ne peut plus lire SON ``/proc/self/environ``.
Rien d'autre (sous-processus, multiprocessing spawn, threads, /proc/self/status, statm, maps, fd :
inchangés). ``SYNORIX_DUMPABLE=1`` désactive ce durcissement (diagnostic avec py-spy).

Ne protège PAS les fichiers lisibles par l'utilisateur du service (`.env` : à posséder par root,
systemd le lit en root ; uploads) : seul un utilisateur Unix dédié aux conversions le ferait.
"""
from __future__ import annotations

import ctypes
import logging
import os
import sys

logger = logging.getLogger(__name__)

_PR_GET_DUMPABLE, _PR_SET_DUMPABLE = 3, 4


def interdire_lecture_memoire() -> bool:
    """Pose ``PR_SET_DUMPABLE = 0`` sur le processus courant. Vrai si l'indicateur est à 0 ensuite.
    Sans effet (faux) hors Linux ou si ``SYNORIX_DUMPABLE=1``. Ne lève jamais."""
    if not sys.platform.startswith("linux") or os.environ.get("SYNORIX_DUMPABLE", "").strip() == "1":
        return False
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        if libc.prctl(_PR_SET_DUMPABLE, 0, 0, 0, 0) != 0:
            logger.warning("PR_SET_DUMPABLE refusé (errno %s)", ctypes.get_errno())
            return False
        return libc.prctl(_PR_GET_DUMPABLE, 0, 0, 0, 0) == 0
    except (OSError, AttributeError):
        return False
