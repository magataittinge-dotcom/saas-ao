"""Durcissement du processus (PR_SET_DUMPABLE = 0) : l'environnement de l'API est illisible par
LibreOffice. Les scénarios tournent dans un sous-processus pour ne pas durcir pytest."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
pytestmark = pytest.mark.skipif(not sys.platform.startswith("linux"), reason="/proc (Linux)")

# « L'API » : un processus qui porte un secret dans son environnement, convertit un fichier avec un faux
# soffice, lequel essaie de lire /proc/<pid de l'API>/environ comme le ferait du code hostile.
_API = """
import json, os, sys
sys.path.insert(0, {backend!r})
from services import libreoffice_isole as lo
from services.durcissement import interdire_lecture_memoire
if {durcir!r}:
    interdire_lecture_memoire()
lo._soffice_binary = lambda: {faux!r}
lo.convertir_en_pdf(b"PK", ".docx")
print(open({sortie!r}).read())
"""
_FAUX = """#!{python}
import os, sys, json
args = sys.argv[1:]
try:
    environ = open("/proc/%d/environ" % os.getppid(), "rb").read().decode(errors="replace")
    resultat = {{"lisible": True, "secret": "valeur-factice-environ" in environ}}
except OSError as e:
    resultat = {{"lisible": False, "erreur": type(e).__name__}}
json.dump(resultat, open({sortie!r}, "w"))
open(os.path.join(args[args.index("--outdir") + 1], "entree.pdf"), "wb").write(b"%PDF-1.4 faux")
"""


def _scenario(tmp_path, durcir: bool, **env_en_plus) -> dict:
    faux, sortie = tmp_path / "faux", tmp_path / "sortie.json"
    faux.write_text(_FAUX.format(python=sys.executable, sortie=str(sortie)))
    faux.chmod(0o755)
    # Repli seccomp (pas d'espace de noms utilisateur) : le cas du VPS où AppArmor le refuse. Mesuré : avec
    # l'espace de noms, le noyau ferme déjà /proc/<api>/environ à l'enfant ; on ne s'y fie pas.
    env = {**os.environ, "SYNORIX_LIBREOFFICE_DIR": str(tmp_path / "lo"), "SECRET_FACTICE": "valeur-factice-environ",
           "SYNORIX_LIBREOFFICE_RESEAU": "seccomp", **env_en_plus}
    env.pop("SYNORIX_DUMPABLE", None)
    env.update(env_en_plus)
    r = subprocess.run([sys.executable, "-I", "-c", _API.format(backend=str(BACKEND), durcir=durcir, faux=str(faux),
                                                              sortie=str(sortie))],
                       env=env, capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_temoin_sans_durcissement_l_environ_de_l_api_est_lisible_par_son_enfant(tmp_path):
    """Le constat de la revue : même utilisateur => /proc/<pid>/environ lisible, secrets compris."""
    assert _scenario(tmp_path, durcir=False) == {"lisible": True, "secret": True}


def test_avec_durcissement_l_environ_de_l_api_est_illisible_par_son_enfant(tmp_path):
    assert _scenario(tmp_path, durcir=True) == {"lisible": False, "erreur": "PermissionError"}


def test_le_reglage_de_diagnostic_laisse_le_processus_vidable(tmp_path):
    assert _scenario(tmp_path, durcir=True, SYNORIX_DUMPABLE="1")["lisible"] is True


def test_effets_de_bord_connus_et_limites(tmp_path):
    """Après le durcissement : les sous-processus, multiprocessing et /proc/self/{status,statm,maps,fd}
    fonctionnent ; seul /proc/self/environ du processus lui-même est fermé ; exec remet l'indicateur à 1."""
    code = textwrap.dedent(f"""
        import sys, os, subprocess, multiprocessing as mp
        sys.path.insert(0, {str(BACKEND)!r})
        from services.durcissement import interdire_lecture_memoire
        assert interdire_lecture_memoire() is True
        res = {{}}
        res["statm"] = len(open("/proc/self/statm").read().split())
        res["status"] = "VmRSS" in open("/proc/self/status").read()
        res["maps"] = len(open("/proc/self/maps").read()) > 0
        res["fd"] = len(os.listdir("/proc/self/fd")) > 0
        res["sous_processus"] = subprocess.run([sys.executable, "-c", "print(41+1)"], capture_output=True, text=True).stdout.strip()
        res["enfant_dumpable"] = subprocess.run([sys.executable, "-c", "import ctypes;print(ctypes.CDLL(None).prctl(3,0,0,0,0))"],
                                                capture_output=True, text=True).stdout.strip()
        try:
            open("/proc/self/environ", "rb").read(); res["environ_de_soi"] = "lisible"
        except PermissionError:
            res["environ_de_soi"] = "ferme"
        import json; print(json.dumps(res))
    """)
    r = subprocess.run([sys.executable, "-I", "-c", code], capture_output=True, text=True, timeout=60,
                       env={k: v for k, v in os.environ.items() if k != "SYNORIX_DUMPABLE"})
    assert r.returncode == 0, r.stderr
    res = json.loads(r.stdout.strip().splitlines()[-1])
    assert res == {"statm": 7, "status": True, "maps": True, "fd": True, "sous_processus": "42",
                   "enfant_dumpable": "1", "environ_de_soi": "ferme"}


def test_main_et_le_worker_durcissent_le_processus():
    """Garde : main.py et le module Celery appellent le durcissement ; importer main (comme tous les
    tests de routes) rend le processus de test non vidable, ce qui valide aussi le reste de la suite."""
    import ctypes
    from main import app  # noqa: F401
    if os.environ.get("SYNORIX_DUMPABLE", "").strip() != "1":
        assert ctypes.CDLL(None).prctl(3, 0, 0, 0, 0) == 0
    for fichier in ("main.py", "tasks/check_expiry.py"):
        assert "interdire_lecture_memoire()" in (BACKEND / fichier).read_text(encoding="utf-8"), fichier
