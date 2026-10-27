"""Landlock et systèmes de fichiers 9p (WSL : /mnt/c, /mnt/d…).

Constat du coordinateur (bloc 6) : depuis /mnt/c/saas-ao/backend (appli locale sous WSL, disque Windows
monté en 9p), l'enfant PDFium restreint par Landlock ne lisait plus RIEN sous les dossiers autorisés
(« tâche illisible : PermissionError »), alors que les mêmes règles marchent sur ext4 (11 pages,
34 537 caractères). Les règles posées sur un chemin 9p sont inopérantes : Landlock doit être déclaré
indisponible (repli journalisé, refus en mode « exige »), jamais posé à moitié.
Les essais qui pourraient restreindre le processus tournent dans un sous-processus.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest

from services import landlock

BACKEND = Path(__file__).resolve().parents[1]

MOUNTINFO = (
    "22 1 8:32 / / rw,relatime shared:1 - ext4 /dev/sdc rw,discard\n"
    "80 22 0:62 / /mnt/c rw,noatime - 9p drvfs rw,dirsync,aname=drvfs;path=C:\\\n"
    "81 22 0:63 / /mnt/mon\\040disque rw - 9p drvfs rw\n"
    "90 80 0:70 / /mnt/c/sous ext rw - tmpfs none rw\n"
)


def test_type_du_systeme_de_fichiers_lu_dans_mountinfo():
    t = landlock.type_systeme_fichiers
    assert t("/home/omarov/x", MOUNTINFO) == "ext4"
    assert t("/mnt/c/saas-ao/backend/uploads", MOUNTINFO) == "9p"
    assert t("/mnt/mon disque/a", MOUNTINFO) == "9p"          # espace échappé en \040
    assert t("/mnt/cx/a", MOUNTINFO) == "ext4"                # préfixe de chemin, pas de chaîne
    assert t("/mnt/c/sous", MOUNTINFO) == "tmpfs"             # le point de montage le plus long gagne


def _lancer(code: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-c", code], cwd=BACKEND, capture_output=True, text=True,
                          timeout=60)


@pytest.mark.skipif(landlock.abi_version() < 1, reason="Landlock absent de ce noyau")
def test_une_regle_sur_9p_rend_landlock_indisponible_sans_rien_restreindre(tmp_path):
    code = f"""
import sys
sys.path.insert(0, ".")
from services import landlock
landlock.type_systeme_fichiers = lambda chemin, mountinfo=None: "9p" if chemin.startswith({str(tmp_path)!r}) else "ext4"
try:
    landlock.restreindre([({str(tmp_path)!r}, landlock.LECTURE), ("/usr", landlock.LECTURE_EXEC)])
except landlock.LandlockIndisponible as e:
    open("/etc/hostname").read()          # le processus n'est PAS restreint
    print("INDISPONIBLE", e.strerror)
else:
    print("POSE")
"""
    r = _lancer(code)
    assert "INDISPONIBLE" in r.stdout, r.stdout + r.stderr
    assert "9p" in r.stdout


@pytest.mark.skipif(landlock.abi_version() < 1 or not os.path.isdir("/mnt/c")
                    or landlock.type_systeme_fichiers("/mnt/c") != "9p",
                    reason="pas de disque 9p monté (WSL) sur cette machine")
def test_vrai_chemin_wsl_mnt_c():
    code = """
import sys
sys.path.insert(0, ".")
from services import landlock
try:
    landlock.restreindre([("/mnt/c", landlock.LECTURE), ("/usr", landlock.LECTURE_EXEC)])
    print("POSE")
except landlock.LandlockIndisponible as e:
    print("INDISPONIBLE", e.strerror)
"""
    r = _lancer(code)
    assert "INDISPONIBLE" in r.stdout, r.stdout + r.stderr
