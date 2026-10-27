"""Landlock (noyau Linux >= 5.13) sans root : un processus se retire lui-même l'accès aux fichiers.

Ce module n'utilise que la bibliothèque standard : il est importé par l'API (``services.landlock``),
par le lanceur de LibreOffice (``services/libreoffice_lanceur.py``, lancé par ``python -I -S``) et par
l'enfant PDFium. Il pose, par ``landlock_restrict_self``, un ensemble de règles en LISTE BLANCHE :
tout ce qui n'est pas nommé est refusé, en particulier ``backend/.env``, les ``uploads/`` d'autres
organisations, ``/run/postgresql`` et ``/run/redis`` (sockets Unix de la base et de Redis). La
restriction est héritée par tout processus lancé ensuite (``psql`` y compris) et ne peut jamais être levée.

Version de l'ABI (``abi_version``) : 1 (noyau 5.13) droits de fichier ; 2 REFER ; 3 TRUNCATE ; 4 réseau
TCP (noyau 6.7, Ubuntu 24.04 : 6.8) ; 5 ioctl sur fichiers de périphériques ; 6 portées (signaux, sockets
abstraits). Les droits sont ramenés à ce que le noyau connaît. À partir de l'ABI 4, ``bind`` et ``connect``
TCP sont aussi refusés (défense de plus : le filtre seccomp refuse déjà ``connect``).

Ce que Landlock ne restreint PAS (limites du mécanisme) : ``stat`` et la traversée des dossiers (on peut
savoir qu'un fichier existe), les sockets Unix à chemin avant l'ABI 9 (c'est le filtre seccomp qui refuse
``connect``), UDP. Les chemins sont jugés sur le fichier RÉEL atteint : passer par ``/proc/<pid>/root`` ou
un lien symbolique ne contourne rien.
"""
from __future__ import annotations

import ctypes
import errno
import os
import platform
import struct
from typing import Iterable, Optional

# Numéros d'appels système (identiques sur x86_64 et aarch64)
_NR_CREATE, _NR_ADD_RULE, _NR_RESTRICT = 444, 445, 446
_CREATE_VERSION = 1 << 0
_RULE_PATH_BENEATH = 1

EXECUTE, WRITE_FILE, READ_FILE, READ_DIR = 1 << 0, 1 << 1, 1 << 2, 1 << 3
REMOVE_DIR, REMOVE_FILE = 1 << 4, 1 << 5
MAKE_CHAR, MAKE_DIR, MAKE_REG, MAKE_SOCK = 1 << 6, 1 << 7, 1 << 8, 1 << 9
MAKE_FIFO, MAKE_BLOCK, MAKE_SYM = 1 << 10, 1 << 11, 1 << 12
REFER, TRUNCATE = 1 << 13, 1 << 14
NET_BIND_TCP, NET_CONNECT_TCP = 1 << 0, 1 << 1

_DROITS_ABI1 = (EXECUTE | WRITE_FILE | READ_FILE | READ_DIR | REMOVE_DIR | REMOVE_FILE | MAKE_CHAR | MAKE_DIR
                | MAKE_REG | MAKE_SOCK | MAKE_FIFO | MAKE_BLOCK | MAKE_SYM)
_DROITS_DE_FICHIER = EXECUTE | WRITE_FILE | READ_FILE | TRUNCATE      # seuls droits valables sur un non-dossier

LECTURE = READ_FILE | READ_DIR
LECTURE_EXEC = LECTURE | EXECUTE
ECRITURE = (WRITE_FILE | REMOVE_DIR | REMOVE_FILE | MAKE_CHAR | MAKE_DIR | MAKE_REG | MAKE_SOCK | MAKE_FIFO
            | MAKE_BLOCK | MAKE_SYM | REFER | TRUNCATE)


class LandlockIndisponible(OSError):
    """Landlock n'est pas utilisable (noyau trop ancien, désactivé, ou refusé)."""


def _libc():
    return ctypes.CDLL(None, use_errno=True)


def abi_version() -> int:
    """Version de l'ABI Landlock du noyau ; 0 si Landlock est absent ou désactivé."""
    if not platform.system() == "Linux" or platform.machine() not in ("x86_64", "aarch64"):
        return 0
    libc = _libc()
    version = libc.syscall(_NR_CREATE, None, ctypes.c_size_t(0), ctypes.c_uint32(_CREATE_VERSION))
    return int(version) if version > 0 else 0


def _droits_connus(abi: int) -> int:
    droits = _DROITS_ABI1
    if abi >= 2:
        droits |= REFER
    if abi >= 3:
        droits |= TRUNCATE
    return droits


def restreindre(regles: Iterable[tuple[str, int]], *, reseau_tcp: bool = True) -> tuple[int, list[str]]:
    """Pose les règles ``(chemin, droits)`` puis restreint le processus courant. Renvoie
    ``(abi, chemins ignorés)`` : les chemins absents sont ignorés (ils ne sont pas accessibles de toute façon).

    Tout droit de fichier non listé est refusé sur TOUT le système de fichiers ; ``reseau_tcp`` refuse
    ``bind``/``connect`` TCP (ABI >= 4). Lève ``LandlockIndisponible`` si le noyau ne l'offre pas."""
    abi = abi_version()
    if abi < 1:
        raise LandlockIndisponible(errno.ENOSYS, "Landlock indisponible")
    libc = _libc()
    traite = _droits_connus(abi)
    avec_reseau = reseau_tcp and abi >= 4
    # struct landlock_ruleset_attr : handled_access_fs, [handled_access_net (ABI 4+)]
    attr = struct.pack("<QQ", traite, NET_BIND_TCP | NET_CONNECT_TCP if avec_reseau else 0) if abi >= 4 \
        else struct.pack("<Q", traite)
    tampon = ctypes.create_string_buffer(attr, len(attr))
    ruleset = libc.syscall(_NR_CREATE, tampon, ctypes.c_size_t(len(attr)), ctypes.c_uint32(0))
    if ruleset < 0:
        e = ctypes.get_errno()
        raise LandlockIndisponible(e, os.strerror(e))
    ignores: list[str] = []
    try:
        for chemin, droits in regles:
            try:
                fd = os.open(chemin, os.O_PATH | os.O_CLOEXEC)
            except OSError:
                ignores.append(chemin)
                continue
            try:
                est_dossier = _est_dossier(fd)
                permis = droits & traite
                if not est_dossier:
                    permis &= _DROITS_DE_FICHIER
                if not permis:
                    continue
                # struct landlock_path_beneath_attr (empaquetée) : allowed_access u64, parent_fd s32
                regle = struct.pack("<Qi", permis, fd)
                tampon_regle = ctypes.create_string_buffer(regle, len(regle))
                if libc.syscall(_NR_ADD_RULE, ctypes.c_int(ruleset), ctypes.c_uint32(_RULE_PATH_BENEATH),
                                tampon_regle, ctypes.c_uint32(0)) != 0:
                    e = ctypes.get_errno()
                    raise LandlockIndisponible(e, f"landlock_add_rule : {os.strerror(e)}")
            finally:
                os.close(fd)
        if libc.prctl(38, 1, 0, 0, 0) != 0:                     # PR_SET_NO_NEW_PRIVS
            e = ctypes.get_errno()
            raise LandlockIndisponible(e, "PR_SET_NO_NEW_PRIVS")
        if libc.syscall(_NR_RESTRICT, ctypes.c_int(ruleset), ctypes.c_uint32(0)) != 0:
            e = ctypes.get_errno()
            raise LandlockIndisponible(e, f"landlock_restrict_self : {os.strerror(e)}")
    finally:
        os.close(ruleset)
    return abi, ignores


def _est_dossier(fd: int) -> bool:
    import stat
    return stat.S_ISDIR(os.fstat(fd).st_mode)


def chemins_existants(chemins: Iterable[Optional[str]]) -> list[str]:
    return [c for c in chemins if c and os.path.exists(c)]
