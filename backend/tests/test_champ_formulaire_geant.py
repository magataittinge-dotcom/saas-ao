"""Un champ de formulaire de 300 Mo est refusé sans faire monter la mémoire du serveur.

Faille CVE-2024-47874 (GHSA-f96h-pmfr-66vw), corrigée dans Starlette 0.40.0 :
une partie multipart SANS nom de fichier était accumulée en mémoire, sans
limite, et AVANT l'authentification (FastAPI lit le corps avant de résoudre
les dépendances, donc avant `get_auth_user`). Toutes les routes multipart
étaient exposées. Mesure de l'agent W sur Starlette 0.37.2 : un champ de
300 Mo faisait monter le serveur de +901 Mo et coûtait 73 s de CPU, sur un
serveur de production visé à l'époque (1 vCPU et 4 Go, Hostinger KVM 1 ; le KVM 2 retenu
le 30/10/2026 a 2 vCPU et 8 Go : le champ géant reste à refuser).

Le test lance un vrai uvicorn, en sous-processus, qui sert les deux vraies
routes de dépôt de Synorix (coffre-fort et pièces du DCE), sans importer
`main` et sur une base SQLite jetable. Le corps est envoyé en flux (rien en
mémoire côté client). Un fil surveille la mémoire résidente du serveur
(/proc) : au-delà du plafond, il arrête le serveur, et le test échoue en
quelques secondes au lieu de saturer la machine.
"""
import os
import signal
import socket
import subprocess
import sys
import textwrap
import threading
import time
from pathlib import Path

import httpx
import pytest

BACKEND = Path(__file__).resolve().parent.parent
TAILLE_CHAMP_MO = 300
HAUSSE_MAX_MO = 50  # le champ fait 300 Mo : toute accumulation dépasse ce plafond

ROUTES_MULTIPART = (
    "/api/documents",                       # coffre-fort : fichier + 3 champs
    "/api/projects/projet-banc/documents",  # pièces du DCE : fichier + 1 champ
)

APPLI = textwrap.dedent('''
    import sys
    sys.path.insert(0, {backend!r})
    from fastapi import FastAPI
    from routers import documents, projects
    from services.rate_limit import limiter

    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(documents.router, prefix="/api/documents")
    app.include_router(projects.router, prefix="/api/projects")


    @app.get("/sante")
    def sante():
        return {{"ok": True}}
''')

pytestmark = pytest.mark.skipif(
    not Path("/proc/self/status").exists(), reason="mesure de la mémoire par /proc (Linux)"
)


def _port_libre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _memoire_mo(pid: int) -> dict:
    """VmRSS (mémoire résidente) et VmHWM (son pic) du processus, en Mo."""
    valeurs = {}
    with open(f"/proc/{pid}/status") as f:
        for ligne in f:
            if ligne.startswith(("VmRSS:", "VmHWM:")):
                cle, kio = ligne.split()[:2]
                valeurs[cle.rstrip(":")] = int(kio) / 1024
    return valeurs


def _remettre_pic_a_zero(pid: int) -> bool:
    """Ramène VmHWM à la mémoire actuelle (Linux ≥ 4.0, proc(5) « clear_refs »)."""
    try:
        with open(f"/proc/{pid}/clear_refs", "w") as f:
            f.write("5")
        return True
    except OSError:
        return False


def _temps_cpu_s(pid: int) -> float:
    with open(f"/proc/{pid}/stat") as f:
        champs = f.read().rsplit(")", 1)[1].split()
    return (int(champs[11]) + int(champs[12])) / os.sysconf("SC_CLK_TCK")


def _champ_geant(frontiere: str):
    """Une seule partie, nommée « type » (vrai champ des deux routes), sans nom de fichier."""
    yield (f"--{frontiere}\r\n"
           'Content-Disposition: form-data; name="type"\r\n\r\n').encode()
    bloc = b"a" * (1024 * 1024)
    for _ in range(TAILLE_CHAMP_MO):
        yield bloc
    yield f"\r\n--{frontiere}--\r\n".encode()


def _en_tete_geant(frontiere: str):
    """Une partie dont un en-tête fait 300 Mo (GHSA-pp6c-gr5w-3c5g, CVE-2026-42561).
    Starlette 1.10 accumule les en-têtes de partie sans limite (`on_header_value`) ;
    seul python-multipart ≥ 0.0.27 les borne."""
    yield (f"--{frontiere}\r\n"
           'Content-Disposition: form-data; name="type"\r\n'
           "X-Banc-Synorix: ").encode()
    bloc = b"a" * (1024 * 1024)
    for _ in range(TAILLE_CHAMP_MO):
        yield bloc
    yield f"\r\n\r\nautre\r\n--{frontiere}--\r\n".encode()


@pytest.fixture
def serveur(tmp_path):
    (tmp_path / "appli_banc.py").write_text(APPLI.format(backend=str(BACKEND)))
    port = _port_libre()
    env = dict(os.environ,
               DATABASE_URL=f"sqlite:///{tmp_path / 'jetable.db'}",
               TMPDIR=str(tmp_path))
    # Journal dans un fichier : un tube jamais lu bloquerait le serveur une fois plein.
    journal = open(tmp_path / "uvicorn.log", "wb")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "appli_banc:app", "--app-dir", str(tmp_path),
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=tmp_path, env=env, stdout=subprocess.DEVNULL, stderr=journal)
    base = f"http://127.0.0.1:{port}"
    try:
        limite = time.monotonic() + 90  # imports lents depuis /mnt/c (WSL) à froid
        while True:
            if proc.poll() is not None:
                journal.flush()
                texte = (tmp_path / "uvicorn.log").read_bytes().decode(errors="replace")
                pytest.fail(f"uvicorn n'a pas démarré : {texte[-2000:]}")
            try:
                if httpx.get(f"{base}/sante", timeout=1).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            if time.monotonic() > limite:
                pytest.fail("uvicorn n'a pas répondu en 90 s")
            time.sleep(0.1)
        yield proc, base
    finally:
        if proc.poll() is None:
            proc.send_signal(signal.SIGTERM)
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
        journal.close()


def _envoyer(proc, base: str, route: str, corps) -> dict:
    """Envoie le corps géant en flux et suit la mémoire du serveur pendant l'envoi."""
    frontiere = "frontiere-banc-synorix"
    longueur = sum(len(b) for b in corps(frontiere))
    # Échauffement : un petit formulaire charge le code de lecture multipart.
    httpx.post(f"{base}{route}", files={"file": ("a.pdf", b"%PDF-1.4")}, data={"type": "autre"},
               timeout=10)
    pic_remis = _remettre_pic_a_zero(proc.pid)
    depart = _memoire_mo(proc.pid)["VmRSS"]
    cpu_depart = _temps_cpu_s(proc.pid)
    etat = {"max": depart, "depasse": False}
    fini = threading.Event()

    def surveiller():
        while not fini.is_set() and proc.poll() is None:
            try:
                rss = _memoire_mo(proc.pid).get("VmRSS")
            except OSError:
                return
            if rss is None:  # processus en cours d'arrêt
                return
            etat["max"] = max(etat["max"], rss)
            if rss - depart > HAUSSE_MAX_MO:
                etat["depasse"] = True
                proc.kill()  # version vulnérable : on coupe avant de saturer la machine
                return
            time.sleep(0.02)

    fil = threading.Thread(target=surveiller, daemon=True)
    fil.start()
    t0 = time.monotonic()
    try:
        r = httpx.post(f"{base}{route}", content=corps(frontiere), timeout=120,
                       headers={"content-type": f"multipart/form-data; boundary={frontiere}",
                                "content-length": str(longueur)})
        statut, reponse = r.status_code, r.text[:200]
    except httpx.HTTPError as exc:
        statut, reponse = None, f"{type(exc).__name__}: {exc}"
    finally:
        fini.set()
        fil.join(timeout=5)
    duree = time.monotonic() - t0
    if etat["depasse"]:
        proc.wait(timeout=10)  # serveur coupé : on attend sa fin avant de conclure
    vivant = proc.poll() is None
    if vivant and pic_remis:
        etat["max"] = max(etat["max"], _memoire_mo(proc.pid).get("VmHWM", etat["max"]))
    return {
        "route": route, "statut": statut, "reponse": reponse,
        "hausse_mo": round(etat["max"] - depart, 1), "depasse": etat["depasse"],
        "cpu_s": round(_temps_cpu_s(proc.pid) - cpu_depart, 2) if vivant else None,
        "duree_s": round(duree, 1),
    }


def _verifier_refus_sans_hausse(proc, base: str, corps) -> None:
    for route in ROUTES_MULTIPART:
        mesure = _envoyer(proc, base, route, corps)
        print(mesure)  # visible avec -s : hausse, temps CPU et durée par route
        assert not mesure["depasse"] and mesure["hausse_mo"] <= HAUSSE_MAX_MO, (
            f"le serveur a pris +{mesure['hausse_mo']} Mo pendant l'envoi : {mesure}")
        # Refusé à cause du champ, avant l'authentification : ni 401/403 (corps
        # lu en entier puis jeton absent), ni connexion coupée.
        assert mesure["statut"] is not None and 400 <= mesure["statut"] < 500, mesure
        assert mesure["statut"] not in (401, 403), mesure
        assert proc.poll() is None, "le serveur s'est arrêté"


def test_champ_de_300_mo_refuse_sans_hausse_de_memoire(serveur):
    proc, base = serveur
    _verifier_refus_sans_hausse(proc, base, _champ_geant)


def test_en_tete_de_partie_de_300_mo_refuse_sans_hausse_de_memoire(serveur):
    proc, base = serveur
    _verifier_refus_sans_hausse(proc, base, _en_tete_geant)
