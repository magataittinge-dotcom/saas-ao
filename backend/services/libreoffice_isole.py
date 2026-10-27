"""LibreOffice isolé : toute conversion de Word, tableur ou mémoire en PDF passe ici.

Pourquoi (nuit du 25/10). LibreOffice ouvrait des fichiers DÉPOSÉS par les clients avec
l'environnement complet de l'API (ANTHROPIC_API_KEY, STRIPE_SECRET_KEY, DATABASE_URL…) et le
réseau ouvert ; ``pdf_converter`` n'avait pas de profil jetable (conversions concurrentes en échec,
aucun profil inscriptible sous ``ProtectHome=true``). Un Word peut LIER une image à une adresse
distante : LibreOffice la télécharge à l'ouverture (mesuré, voir tests/test_libreoffice_isole.py).

Ce que fait une conversion (``convertir_en_pdf``) :

- UNE à la fois sur la machine : verrou de fichier ``flock`` dans ``SYNORIX_LIBREOFFICE_DIR``
  (l'API et le worker Celery sont deux processus ; ``PrivateTmp=true`` donne à chacun son propre
  ``/tmp`` : le verrou ne peut pas y vivre). L'attente est bornée (``attente_s``) : au-delà,
  ``PdfConversionError("attente")``, jamais d'attente sans fin.
- Dossier de travail JETABLE ``conv-…`` sous ce même dossier (inscriptible sous ``ProtectSystem=strict``
  grâce à ``ReadWritePaths``) : le fichier, le profil LibreOffice (``-env:UserInstallation``),
  ``TMPDIR``, ``fonts.conf``. Supprimé à la sortie ; les restes d'un arrêt brutal sont balayés.
- Environnement MINIMAL, liste blanche : PATH fixe, HOME vers le dossier jetable, LANG/LC_ALL,
  TMPDIR, FONTCONFIG_FILE. Aucun secret ne peut arriver au sous-processus.
- Profil préréglé (``ecrire_profil``) : macros désactivées, aucune mise à jour automatique,
  liens et images distantes jamais rechargés à l'ouverture.
- Lanceur (services/libreoffice_lanceur.py) : plafond de mémoire (``SYNORIX_LIBREOFFICE_AS_MO``),
  taille de fichier écrit, mort avec l'API, et SANS CONNEXION SORTANTE : filtre seccomp qui refuse
  ``connect()`` (IP et Unix, donc ni Internet ni la base ni Redis) et, quand le noyau l'autorise, espace
  de noms réseau vide en plus. L'espace de noms SEUL ne suffit pas : il n'isole pas les sockets Unix à
  chemin (Postgres en authentification « peer »). Niveau obtenu journalisé à chaque conversion.
- Landlock (services/landlock.py, règles : ``regles_landlock``) : liste blanche des fichiers lisibles et
  du seul dossier inscriptible ; ``.env`` et ``uploads/`` sont refusés (les sockets de la base et de Redis le sont
  par le seccomp).
- ``/tmp`` : soffice y crée son socket ``OSL_PIPE_<uid>_…`` (codé en dur, ``TMPDIR`` n'y change rien) ; sous systemd
  (``PrivateTmp=true``) c'est le ``/tmp`` de l'API, où elle range ses temporaires. Niveau « privé » : le lanceur monte
  le dossier jetable sur ``/tmp`` dans un espace de noms de montage (quand l'espace de noms utilisateur est permis) et
  Landlock ne donne aucun droit sur le vrai ``/tmp``. Niveau « partagé » (repli, AppArmor d'Ubuntu 24.04) : ``MAKE_SOCK |
  REMOVE_FILE`` sans ``READ_DIR`` (mesuré : ``MAKE_SOCK`` seul fait échouer soffice, qui efface le socket avant de le
  créer) ; il ne liste rien, ne lit rien, mais peut effacer un fichier dont il connaît le nom exact (ceux de l'API sont
  aléatoires). L'API balaie ensuite le socket laissé (``_balayer_sockets_osl_pipe``). Le niveau est journalisé.
- Délai : au-delà, TOUT le groupe de processus est tué (``soffice`` lance ``soffice.bin``).

Réglages (variables d'environnement, relues à chaque conversion) :
``SYNORIX_LIBREOFFICE_DIR``, ``_AS_MO`` (1536), ``_FICHIER_MO`` (512), ``_DELAI_S`` (120),
``_ATTENTE_S`` (90, travail interactif), ``_ATTENTE_DEPOT_S`` (900, Word déposé en arrière-plan),
``_RESEAU`` (``auto`` | ``exige`` | ``aucun``), ``_LANDLOCK`` (``auto`` | ``aucun``), ``_TMP`` (``auto`` | ``partage``).
Avec ``_RESEAU=exige``, la conversion est refusée si le filtre seccomp ou Landlock ne peut pas être posé.
Limite : sans Landlock (noyau < 5.13 ou désactivé), les fichiers lisibles par l'utilisateur du service
(.env, uploads) restent lisibles par du code natif exécuté dans LibreOffice ; le niveau journalisé
(« landlock: absent ») le dit.
Aucune donnée du DCE dans les journaux : ni nom de fichier, ni contenu.
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import signal
import socket
import stat
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from services import landlock

logger = logging.getLogger(__name__)

_RACINE_BACKEND = Path(__file__).resolve().parent.parent
_LANCEUR = Path(__file__).resolve().with_name("libreoffice_lanceur.py")

# Carlito (clone métrique libre de Calibri, SIL OFL 1.1) est livrée avec le code.
# Le Word déclare Calibri ; LibreOffice la remplace par Carlito, de mêmes largeurs,
# si fontconfig la voit — sans dépendre du paquet système `fonts-crosextra-carlito`.
DOSSIER_CARLITO = _RACINE_BACKEND / "assets" / "fonts" / "carlito"

# Valeurs par défaut. Mesures (outils-libre/mesure_lo.py, KVM-like) : le mémoire de Gueux (100 Ko)
# monte à 578 Mo de mémoire virtuelle, un tableur de 60 000 lignes à 672 Mo, un Word de 400 pages et
# 192 Mo d'images à 992 Mo ; à 800 Mo ce dernier échoue (code 0 mais aucun PDF). 1536 Mo laisse
# ≥ 1,5 fois le pire cas mesuré, et un seul LibreOffice tourne à la fois sur un KVM 1 (4 Go).
AS_MO_DEFAUT = 1536
FICHIER_MO_DEFAUT = 512
DELAI_S_DEFAUT = 120
ATTENTE_S_DEFAUT = 90
ATTENTE_DEPOT_S_DEFAUT = 900
DELAI_MAX_S = 600
_VIEUX_DOSSIER_S = 3600

__all__ = ["PdfConversionError", "convertir_en_pdf", "soffice_available", "ecrire_profil",
           "ecrire_fontconfig", "delai_s", "attente_s", "attente_depot_s", "delai_depot_s",
           "dossier_travail", "DOSSIER_CARLITO"]


class PdfConversionError(RuntimeError):
    """Conversion en PDF impossible. ``str(exc)`` est la phrase pour l'utilisateur (positive,
    sans détail technique) ; ``raison`` : ``attente`` (une autre conversion tient la place),
    ``delai``, ``echec`` (fichier trop lourd ou abîmé), ``indisponible`` (LibreOffice absent ou
    non lançable), ``reseau`` (isolation exigée mais impossible)."""

    def __init__(self, message: str, raison: str = "echec") -> None:
        super().__init__(message)
        self.raison = raison

    @property
    def retry_apres_s(self) -> int:
        return {"attente": 15, "delai": 60}.get(self.raison, 30)


# ─── Réglages ─────────────────────────────────────────────────────────────────

def _entier(nom: str, defaut: int, minimum: int = 0) -> int:
    try:
        return max(minimum, int(os.environ.get(nom, "").strip() or defaut))
    except ValueError:
        return defaut


def delai_s() -> float:
    return float(_entier("SYNORIX_LIBREOFFICE_DELAI_S", DELAI_S_DEFAUT, 1))


def attente_s() -> float:
    return float(_entier("SYNORIX_LIBREOFFICE_ATTENTE_S", ATTENTE_S_DEFAUT, 0))


def attente_depot_s() -> float:
    return float(_entier("SYNORIX_LIBREOFFICE_ATTENTE_DEPOT_S", ATTENTE_DEPOT_S_DEFAUT, 0))


def delai_depot_s(taille_octets: int) -> float:
    """Délai d'un fichier déposé : le socle, plus 2 s par Mo (mesuré : 192 Mo en 27 s), borné."""
    return min(float(DELAI_MAX_S), delai_s() + 2.0 * taille_octets / (1024 * 1024))


def _mode_reseau() -> str:
    mode = os.environ.get("SYNORIX_LIBREOFFICE_RESEAU", "auto").strip().lower()
    return mode if mode in ("auto", "exige", "aucun", "netns", "seccomp") else "auto"


def _mode_landlock() -> str:
    """``auto`` (défaut) : Landlock si le noyau l'offre ; ``aucun`` : désactivé (diagnostic, tests)."""
    return "aucun" if os.environ.get("SYNORIX_LIBREOFFICE_LANDLOCK", "auto").strip().lower() == "aucun" else "auto"


def tmp_prive_possible(base: Path) -> bool:
    """Le dossier jetable accepte-t-il un socket Unix ? Monté sur ``/tmp``, il reçoit le socket ``OSL_PIPE`` de
    soffice. MESURÉ (tests/test_libreoffice_tmp_9p.py) : sur le disque 9p de WSL (/mnt/c, appli locale),
    ``bind`` y échoue (errno 95) et soffice sortait en code 1. La sonde ne laisse rien derrière elle."""
    # Par le descripteur du dossier : l'adresse reste courte (108 octets au plus pour un socket Unix),
    # quelle que soit la longueur du chemin du dossier jetable.
    nom = f".sonde-{uuid.uuid4().hex[:8]}"
    try:
        fd = os.open(base, os.O_PATH | os.O_DIRECTORY | os.O_CLOEXEC)
    except OSError:
        return False
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        s.bind(f"/proc/self/fd/{fd}/{nom}")
        return True
    except OSError:
        return False
    finally:
        s.close()
        try:
            os.unlink(nom, dir_fd=fd)
        except OSError:
            pass
        os.close(fd)


def _mode_tmp() -> str:
    """``auto`` (défaut) : ``/tmp`` privé si le noyau le permet ; ``partage`` : jamais (diagnostic, tests du repli)."""
    return "partage" if os.environ.get("SYNORIX_LIBREOFFICE_TMP", "auto").strip().lower() == "partage" else "auto"


def regles_landlock(base: Path, binaire: Optional[str] = None) -> list:
    """Règles Landlock de LibreOffice, en LISTE BLANCHE (mesurées : outils-libre/trace_lo.py, un préchargement
    qui journalise les ``open`` d'un vrai soffice pendant la conversion d'un mémoire, d'un Word avec image,
    d'un tableur et d'un ODT) :

    - lecture et exécution : ``/usr`` (installation de LibreOffice ``/usr/lib/libreoffice``, bibliothèques,
      polices ``/usr/share/fonts``, ``/usr/lib/ssl``), ``/lib*``, ``/bin``, ``/sbin`` ;
    - lecture : la configuration que LibreOffice lit au démarrage (``/etc/libreoffice``, ``/etc/fonts``,
      ``/etc/ld.so.*``, ``passwd``, ``group``, ``nsswitch.conf``, ``localtime``, ``alternatives``, ``dconf``,
      ``gnutls``, ``gcrypt``, ``gnupg``, ``cups/client.conf``), le cache de polices, Carlito livrée avec
      le code, ``/proc`` et ``/sys`` (état du processus et du matériel), ``/dev/urandom``, ``random``, ``zero`` ;
    - écriture : le SEUL dossier jetable de la conversion (``base`` : fichier d'entrée copié, profil, sortie,
      ``TMPDIR``, ``fonts.conf``) et ``/dev/null``.
    Refusé : tout le reste, dont ``backend/.env`` et ``uploads/`` (le fichier d'entrée est DÉJÀ copié dans ``base``,
    aucun chemin d'upload n'est ouvert) et les fichiers de ``/run/postgresql`` et ``/run/redis``. Landlock ne
    filtre pas ``connect()`` vers ces sockets (avant l'ABI 9) : c'est le filtre seccomp qui le refuse."""
    L = landlock
    lecture_exec = ["/usr", "/lib", "/lib64", "/bin", "/sbin"]
    lecture = ["/etc/fonts", "/etc/libreoffice", "/etc/ld.so.cache", "/etc/ld.so.conf", "/etc/ld.so.conf.d",
               "/etc/passwd", "/etc/group", "/etc/nsswitch.conf", "/etc/localtime", "/etc/alternatives",
               "/etc/dconf", "/etc/gnutls", "/etc/gcrypt", "/etc/gnupg", "/etc/cups/client.conf",
               "/var/cache/fontconfig", str(DOSSIER_CARLITO), "/proc", "/sys",
               "/dev/urandom", "/dev/random", "/dev/zero"]
    regles = [(c, L.LECTURE_EXEC) for c in lecture_exec]
    regles += [(c, L.LECTURE) for c in lecture]
    if binaire:                          # LibreOffice installé hors de /usr (archive officielle dans /opt…)
        programme = Path(os.path.realpath(binaire)).parent
        if programme.name == "program" and not str(programme).startswith("/usr/"):
            regles.append((str(programme.parent), L.LECTURE_EXEC))
    regles.append((str(base), L.LECTURE | L.ECRITURE))
    regles.append(("/dev/null", L.READ_FILE | L.WRITE_FILE))
    # /tmp : voir regles_landlock_tmp (le lanceur choisit selon qu'il a pu monter un /tmp privé)
    return [[c, int(d)] for c, d in regles]


def regles_landlock_tmp(base: Path) -> dict:
    """Droits sur ``/tmp``, donnés au lanceur qui choisit (il sait seul si le montage privé a réussi) :

    - ``tmp_prive`` : le dossier jetable monté sur ``/tmp`` (lecture et écriture) ; le vrai ``/tmp`` n'a AUCUN droit ;
    - ``tmp_partage`` (repli) : ``MAKE_SOCK | REMOVE_FILE`` sur ``/tmp`` — pas ``READ_DIR``, pas ``READ_FILE`` : soffice
      crée son socket ``OSL_PIPE_…`` et l'efface (``unlink`` avant ``bind``, mesuré), sans rien lister ni lire. ``/var/tmp``
      seulement si ``/tmp`` n'est pas inscriptible (sal y bascule alors)."""
    L = landlock
    partage = [["/tmp", int(L.MAKE_SOCK | L.REMOVE_FILE)]]
    if not os.access("/tmp", os.W_OK):
        partage.append(["/var/tmp", int(L.MAKE_SOCK | L.REMOVE_FILE)])
    return {"tmp_prive": [[str(base / "tmp"), int(L.LECTURE | L.ECRITURE)]], "tmp_partage": partage}


def dossier_travail() -> Path:
    """Dossier inscriptible, commun à l'API et au worker (verrou, dossiers jetables)."""
    return Path(os.environ.get("SYNORIX_LIBREOFFICE_DIR") or _RACINE_BACKEND / "cache" / "libreoffice")


def _soffice_binary() -> Optional[str]:
    return shutil.which("soffice") or shutil.which("libreoffice")


def soffice_available() -> bool:
    return _soffice_binary() is not None


# ─── Messages (positifs, sans détail technique) ──────────────────────────────

_MESSAGES = {
    "attente": "Une autre conversion PDF est en cours sur le serveur. Réessayez dans une minute.",
    "delai": ("La conversion en PDF prend plus de temps que prévu. Réessayez dans quelques minutes, "
              "ou utilisez la version Word en attendant."),
    "echec": ("Ce document n'a pas pu être converti en PDF (fichier très volumineux ou non standard). "
              "La version Word reste disponible."),
    "indisponible": ("La conversion en PDF n'est pas disponible sur ce serveur pour le moment "
                     "(LibreOffice n'est pas lançable). La version Word reste disponible."),
    "reseau": ("La conversion en PDF est suspendue le temps de vérifier la configuration du serveur. "
               "La version Word reste disponible."),
}


def _erreur(raison: str) -> PdfConversionError:
    return PdfConversionError(_MESSAGES[raison], raison)


# ─── Profil, polices, environnement ──────────────────────────────────────────

_OOR = ('<?xml version="1.0" encoding="UTF-8"?>\n'
        '<oor:items xmlns:oor="http://openoffice.org/2001/registry" '
        'xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n')


def _reglage(chemin: str, nom: str, valeur: str) -> str:
    return (f'<item oor:path="{chemin}"><prop oor:name="{nom}" oor:op="fuse">'
            f'<value>{valeur}</value></prop></item>\n')


def ecrire_profil(profil: Path) -> None:
    """Profil LibreOffice préréglé (``<profil>/user/registrymodifications.xcu``).

    - macros : niveau « très élevé » et exécution désactivée ;
    - mises à jour : aucune vérification automatique ;
    - liens : « jamais » mis à jour à l'ouverture dans Writer et Calc (0 = toujours,
      1 = sur demande, 2 = jamais), liens externes de Calc compris ;
    - pas d'OpenCL (le serveur n'a pas de GPU), pas d'assistant de premier démarrage.
    MESURÉ (tests/test_libreoffice_isole.py) : seul ``BlockUntrustedRefererLinks`` empêche le
    téléchargement d'une image liée à une adresse distante (Word et ODT) ; ``Content/Update/Link``
    ne l'empêche pas. Les autres réglages sont préventifs, sans test propre. Le blocage du réseau
    par le noyau (lanceur) reste la protection de fond."""
    script = "/org.openoffice.Office.Common/Security/Scripting"
    contenu = _OOR + "".join([
        _reglage(script, "MacroSecurityLevel", "3"),
        _reglage(script, "DisableMacrosExecution", "true"),
        _reglage(script, "BlockUntrustedRefererLinks", "true"),
        _reglage("/org.openoffice.Office.Writer/Content/Update", "Link", "2"),
        _reglage("/org.openoffice.Office.Writer/Content/Update", "Field", "false"),
        _reglage("/org.openoffice.Office.Calc/Content/Update", "Link", "2"),
        _reglage("/org.openoffice.Office.Common/Misc", "UseOpenCL", "false"),
        _reglage("/org.openoffice.Office.Common/Misc", "FirstRun", "false"),
        _reglage("/org.openoffice.Office.Jobs/Jobs/org.openoffice.Office.Jobs:Job['UpdateCheck']/Arguments",
                 "AutoCheckEnabled", "false"),
    ]) + "</oor:items>\n"
    (profil / "user").mkdir(parents=True, exist_ok=True)
    (profil / "user" / "registrymodifications.xcu").write_text(contenu, encoding="utf-8")


def ecrire_fontconfig(dossier: Path) -> Path:
    """fonts.conf du sous-processus seulement : la configuration système, plus
    le dossier de Carlito. Le reste de la machine n'est pas touché."""
    conf = dossier / "fonts.conf"
    conf.write_text(
        '<?xml version="1.0"?>\n'
        '<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n'
        "<fontconfig>\n"
        '  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>\n'
        f"  <dir>{DOSSIER_CARLITO}</dir>\n"
        f"  <cachedir>{dossier / 'fc-cache'}</cachedir>\n"
        "</fontconfig>\n",
        encoding="utf-8",
    )
    return conf


def environnement(base: Path, fontconfig: Path) -> dict:
    """Liste blanche : RIEN d'autre n'est hérité de l'API (ni clé, ni URL de base)."""
    return {
        "PATH": "/usr/local/bin:/usr/bin:/bin",
        "HOME": str(base),
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "TMPDIR": str(base / "tmp"),
        "FONTCONFIG_FILE": str(fontconfig),
    }


# ─── Verrou : une conversion à la fois, entre threads ET entre processus ─────

_VERROU_THREAD = threading.Lock()


class _UneConversionALaFois:
    """Verrou à attente bornée. ``flock`` (entre processus) ; à défaut (plate-forme sans ``fcntl``,
    dossier non inscriptible), le seul verrou de thread du processus."""

    def __init__(self, dossier: Path, attente: float) -> None:
        self.dossier, self.attente = dossier, attente
        self._fichier = None
        self._thread = False

    def __enter__(self):
        fin = time.monotonic() + self.attente
        if not _VERROU_THREAD.acquire(timeout=max(0.0, self.attente)):
            raise _erreur("attente")
        self._thread = True
        try:
            import fcntl
            self.dossier.mkdir(parents=True, exist_ok=True)
            self._fichier = open(self.dossier / "soffice.lock", "a")
            while True:
                try:
                    fcntl.flock(self._fichier, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    return self
                except BlockingIOError:
                    if time.monotonic() >= fin:
                        raise _erreur("attente") from None
                    time.sleep(0.2)
        except (ImportError, OSError) as e:
            if self._fichier is not None:
                self._fichier.close()
                self._fichier = None
            logger.warning("Verrou entre processus indisponible (%s) : verrou de ce processus seul", type(e).__name__)
            return self
        except BaseException:
            self.__exit__()
            raise

    def __exit__(self, *exc):
        try:
            if self._fichier is not None:
                self._fichier.close()      # ferme et libère le verrou de fichier
                self._fichier = None
        finally:
            if self._thread:
                self._thread = False
                _VERROU_THREAD.release()


def _balayer_anciens(dossier: Path) -> None:
    """Restes d'un arrêt brutal : dossiers ``conv-…`` de plus d'une heure (sous le verrou)."""
    try:
        limite = time.time() - _VIEUX_DOSSIER_S
        for d in dossier.glob("conv-*"):
            if d.is_dir() and d.stat().st_mtime < limite:
                shutil.rmtree(d, ignore_errors=True)
    except OSError:
        pass


# ─── Exécution ───────────────────────────────────────────────────────────────

def _tuer_groupe(pid: int) -> None:
    try:
        os.killpg(pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def _executer(cmd: list, env: dict, base: Path, delai: float) -> int:
    """Lance ``cmd`` dans son propre groupe de processus ; au délai, TOUT le groupe est tué.
    Renvoie le code de sortie. Lève ``PdfConversionError("delai")``."""
    with open(base / "stderr.txt", "wb") as err:
        p = subprocess.Popen(cmd, env=env, cwd=str(base), stdin=subprocess.DEVNULL,
                             stdout=subprocess.DEVNULL, stderr=err, start_new_session=True,
                             close_fds=True)
        try:
            code = p.wait(timeout=delai)
        except subprocess.TimeoutExpired:
            _tuer_groupe(p.pid)
            p.wait()
            raise _erreur("delai") from None
        finally:
            _tuer_groupe(p.pid)        # soffice.bin resté en vie après la fin de soffice
    return code


_DOSSIERS_TMP = ("/tmp", "/var/tmp")


def _ouvrir_regulier(chemin: Path) -> Optional[int]:
    """Descripteur d'un fichier ORDINAIRE du dossier jetable, ou None. Tout ce que soffice laisse dans ce dossier est
    hostile (il y écrit, supposé compromis) : un lien symbolique ``entree.pdf -> backend/.env`` ferait lire ce fichier
    par l'API et le rendrait à l'utilisateur comme « PDF » ; un FIFO ferait attendre l'ouverture sans fin. Pas de lien
    suivi (``O_NOFOLLOW``), pas de blocage (``O_NONBLOCK``), type vérifié sur le descripteur (pas de course)."""
    try:
        fd = os.open(chemin, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    except OSError:
        return None
    try:
        if stat.S_ISREG(os.fstat(fd).st_mode):
            return fd
    except OSError:
        pass
    os.close(fd)
    return None


def _lire_sobre(chemin: Path, max_octets: int = 300) -> Optional[str]:
    """Début d'un petit fichier texte du dossier jetable (état du lanceur, stderr), sans suivre de lien."""
    fd = _ouvrir_regulier(chemin)
    if fd is None:
        return None
    with os.fdopen(fd, "rb") as f:
        return f.read(max_octets).decode("utf-8", errors="replace")


_ETAT_VALIDE = re.compile(r"^[a-z+\-]+( \([^\n\r]{0,250}\))?$")


def _etat_reseau(base: Path) -> str:
    """Niveau d'isolation écrit par le lanceur, vérifié : soffice peut réécrire ce fichier (il est dans son dossier), le
    journal n'en reçoit donc que le format attendu (jeton d'isolation, refus éventuels), jamais un contenu quelconque."""
    texte = _lire_sobre(base / "reseau.txt")
    if texte is not None and _ETAT_VALIDE.match(texte):
        return texte
    return "inconnu"


def _sockets_osl_pipe(dossiers=_DOSSIERS_TMP) -> set:
    """Chemins des sockets ``OSL_PIPE_<uid>_…`` de l'utilisateur courant dans ``dossiers`` (motif exact, vrai socket,
    pas un lien, appartenant à cet utilisateur)."""
    uid = os.getuid()
    motif = re.compile(rf"^OSL_PIPE_{uid}_[A-Za-z0-9_.-]+$")
    trouves = set()
    for dossier in dossiers:
        try:
            noms = os.listdir(dossier)
        except OSError:
            continue
        for nom in noms:
            if not motif.match(nom):
                continue
            chemin = os.path.join(dossier, nom)
            try:
                st = os.lstat(chemin)
            except OSError:
                continue
            if stat.S_ISSOCK(st.st_mode) and st.st_uid == uid:
                trouves.add(chemin)
    return trouves


def _balayer_sockets_osl_pipe(dossiers, avant: set) -> int:
    """Efface les sockets ``OSL_PIPE_<uid>_…`` apparus depuis ``avant`` (pris au début de la conversion, sous le
    verrou : une seule conversion à la fois). Niveau « /tmp partagé » : soffice a pu être tué (délai) avant d'effacer son
    socket. Jamais un autre fichier, jamais un socket plus ancien. Renvoie le nombre d'effacés."""
    n = 0
    for chemin in _sockets_osl_pipe(dossiers) - avant:
        try:
            os.unlink(chemin)
            n += 1
        except OSError:
            pass
    return n


def convertir_en_pdf(entree, extension: str = ".docx", destination: Optional[Path] = None, *,
                     delai: Optional[float] = None, attente: Optional[float] = None):
    """Convertit ``entree`` (octets ou chemin) en PDF. Renvoie les octets du PDF, ou, avec
    ``destination``, écrit le PDF à cet endroit (d'un coup) et renvoie son chemin.
    Lève ``PdfConversionError`` (message pour l'utilisateur, ``raison`` pour le code)."""
    binaire = _soffice_binary()
    if binaire is None:
        raise _erreur("indisponible")
    delai = delai_s() if delai is None else float(delai)
    attente = attente_s() if attente is None else float(attente)
    racine = dossier_travail()
    extension = extension if extension.startswith(".") else "." + extension

    with _UneConversionALaFois(racine, attente):
        _balayer_anciens(racine)
        base = racine / f"conv-{uuid.uuid4().hex}"
        sockets_avant = _sockets_osl_pipe()
        try:
            (base / "tmp").mkdir(parents=True)
            fichier = base / f"entree{extension.lower()}"
            if isinstance(entree, (bytes, bytearray)):
                fichier.write_bytes(entree)
            else:
                shutil.copyfile(entree, fichier)
            profil = base / "profil"
            ecrire_profil(profil)
            env = environnement(base, ecrire_fontconfig(base))
            reglage_reseau = _mode_reseau()
            cfg = {
                "cmd": [binaire, "--headless", "--norestore", "--nologo", "--nodefault", "--nolockcheck",
                        f"-env:UserInstallation={profil.as_uri()}",
                        "--convert-to", "pdf", "--outdir", str(base), str(fichier)],
                "as_octets": _entier("SYNORIX_LIBREOFFICE_AS_MO", AS_MO_DEFAUT) * 1024 * 1024,
                "fichier_octets": _entier("SYNORIX_LIBREOFFICE_FICHIER_MO", FICHIER_MO_DEFAUT) * 1024 * 1024,
                "reseau": reglage_reseau,
                "fichier_etat": str(base / "reseau.txt"),
            }
            if _mode_landlock() == "auto":
                cfg["landlock"] = {"regles": regles_landlock(base, binaire), **regles_landlock_tmp(base)}
            if _mode_tmp() == "auto":
                if tmp_prive_possible(base):
                    cfg["tmp_prive"] = str(base / "tmp")
                else:
                    logger.info("Dossier jetable sans socket Unix (disque 9p de WSL ?) : /tmp partagé pour soffice")
            cmd = [sys.executable, "-I", "-S", str(_LANCEUR), json.dumps(cfg)]
            debut = time.monotonic()
            try:
                code = _executer(cmd, env, base, delai)
            except OSError as e:
                logger.error("LibreOffice non lançable : %s", type(e).__name__)
                raise _erreur("indisponible") from e
            duree = time.monotonic() - debut
            etat_reseau = _etat_reseau(base)
            pdf = base / "entree.pdf"
            if code == 97:
                logger.error("Conversion PDF refusée : isolation exigée, impossible (%s)", etat_reseau)
                raise _erreur("reseau")
            if _mode_landlock() == "auto" and "landlock" not in etat_reseau.split(" ")[0]:
                logger.warning("Conversion PDF SANS Landlock (%s) : les fichiers du serveur lisibles par l'utilisateur "
                               "du service (.env, uploads) le sont aussi par LibreOffice", etat_reseau)
            if "seccomp" not in etat_reseau.split(" ")[0]:
                logger.warning("Conversion PDF SANS isolation réseau complète (%s) : sockets Unix du système de "
                               "fichiers joignables ; seuls les réglages du profil protègent", etat_reseau)
            fd_pdf = _ouvrir_regulier(pdf) if code == 0 else None
            if fd_pdf is None:
                detail = (_lire_sobre(base / "stderr.txt", 200) or "").replace("\n", " ")
                logger.error("LibreOffice sans PDF (code %s, %.1f s, réseau %s) : %s", code, duree, etat_reseau, detail)
                raise _erreur("echec")
            with os.fdopen(fd_pdf, "rb") as source:
                logger.info("PDF converti en %.1f s (%d Ko, réseau : %s, %s)", duree, os.fstat(source.fileno()).st_size // 1024,
                            etat_reseau, "tmp privé" if "tmp-prive" in etat_reseau.split(" ")[0].split("+") else "tmp partagé")
                if destination is None:
                    return source.read()
                destination = Path(destination)
                destination.parent.mkdir(parents=True, exist_ok=True)
                partiel = destination.with_name(destination.name + f".{uuid.uuid4().hex[:8]}.part")
                with open(partiel, "wb") as sortie:
                    shutil.copyfileobj(source, sortie)
                os.replace(partiel, destination)
                return destination
        finally:
            _balayer_sockets_osl_pipe(_DOSSIERS_TMP, sockets_avant)
            shutil.rmtree(base, ignore_errors=True)
