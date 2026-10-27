"""Travaux PDFium dans un PROCESSUS enfant : isolé, plafonné en mémoire, avec un délai.

Pourquoi. PDFium (pypdfium2) tourne en code natif : un PDF piégé de 330 Ko a déjà fait monter
l'API au-delà de 6 Go (rapport G), un plan vectoriel lu monte à ~585 Mo, un plantage natif
emporte tout le processus qui lit. Sur le KVM 1 (1 vCPU, 4 Go pour Postgres, Redis, l'API,
Celery, LibreOffice et les PDF), toute lecture de fichier déposé se fait donc ici :

- UN SEUL processus pdfium au total par défaut (``SYNORIX_PDFIUM_PROCESSUS=1``). Avec un seul
  cœur, un 2e processus ne va pas plus vite ; il double seulement la mémoire. L'extraction au
  dépôt, le rendu des aperçus de « Voir dans le DCE » et le calcul des ancres PARTAGENT ce
  processus : un clic d'aperçu attend au plus la tâche en cours (une pièce, ou une page), il
  ne coûte pas un second processus. ``0`` = exécution directe dans l'appelant (diagnostic et
  tests, SANS protection) ; ``2`` ou plus pour un serveur à plusieurs cœurs.
- lancé par ``subprocess`` (exec d'un Python neuf : jamais de fork d'un processus qui a des threads)
  avec un ENVIRONNEMENT MINIMAL (PATH, LANG, LC_ALL) : aucune clé, aucune URL de base ne lui est
  transmise, alors qu'il lit des fichiers hostiles. Il se déclare aussi « non vidable »
  (``PR_SET_DUMPABLE = 0``, services/durcissement.py) pour que ses pairs du même utilisateur ne lisent
  pas son ``/proc/<pid>/environ`` ni sa mémoire ;
- plafond de mémoire virtuelle ``RLIMIT_AS`` posé dans le processus enfant
  (``SYNORIX_PDFIUM_AS_MO``) : une allocation au-delà échoue dans l'enfant (``MemoryError``
  ou arrêt de l'enfant), l'API ne bouge pas ;
- délai par tâche (``delai_s``) : au-delà, l'enfant est TUÉ et remplacé ;
- recyclage : l'enfant est remplacé après ``SYNORIX_PDFIUM_TACHES_MAX`` tâches, ou dès que sa
  mémoire résidente dépasse ``SYNORIX_PDFIUM_RSS_MAX_MO`` (glibc ne rend pas tout, même avec
  ``malloc_trim``).

Compromis mémoire contre équité. Un seul processus signifie qu'un gros dépôt (une pièce peut
tenir le processus jusqu'à 15 minutes) retarde les travaux des autres organisations. On ne
règle pas cela en ajoutant des processus (chacun peut tenir 1,5 Go : le KVM 1 n'a pas la
mémoire), mais en BORNANT l'attente : nul n'attend une place indéfiniment. Un travail
interactif (aperçu, ancre au premier clic) attend ``ATTENTE_INTERACTIF_S`` (5 s, réglable
``SYNORIX_PDFIUM_ATTENTE_S``) puis lève ``TravailPdfiumEchoue("attente")`` : la route répond
503 avec ``Retry-After`` (services/pdfium_http.py) et le front réessaie. L'extraction attend
``ATTENTE_EXTRACTION_S`` (600 s, ``SYNORIX_PDFIUM_ATTENTE_EXTRACTION_S``) puis la pièce est
signalée à redéposer. Les petites pièces ont un délai court (services/extraction_processus.py :
30 s + 3 s par Mo), donc une pièce piégée libère vite le processus. Sur un serveur plus gros :
``SYNORIX_PDFIUM_PROCESSUS=2`` donne un second processus ; il faut alors réserver l'un des deux
à l'interactif (un jeu de places distinct, non fait ici : l'équité par organisation est hors
périmètre de cette version, les places sont servies dans l'ordre d'arrivée).

Usage (bloquant : l'appelant asynchrone l'enveloppe dans ``asyncio.to_thread``) ::

    resultat = executer(ma_fonction, arg1, arg2, delai_s=30)

``ma_fonction`` est une fonction de NIVEAU MODULE (elle voyage par référence) ; les arguments
doivent être picklables (sens parent -> enfant : le parent est de confiance). Le RÉSULTAT remonte par
``services/canal_enfant.py`` : du JSON à schéma explicite (str, int, float, bool, None, list, dict à clés str, plus
tuple, octets et exceptions de sa liste fermée), 16 Mo au plus par message ; l'enfant n'est PAS de confiance (il lit des
fichiers hostiles), le parent ne fait donc jamais ``pickle.loads`` sur ses octets. Une exception de la
fonction (de cette liste) est relancée telle quelle chez l'appelant, une autre devient ``RuntimeError`` ; un échec du TRAVAIL (délai, plantage, mémoire) lève ``TravailPdfiumEchoue`` et
l'API reste debout. Dans l'enfant, ``signaler(objet)`` remonte un avancement vers le
paramètre ``sur_progression`` de l'appelant.

L'enfant n'est plus un ``multiprocessing.Process`` : le script appelant n'a plus besoin de la garde
``if __name__ == "__main__":`` et n'est jamais ré-importé dans l'enfant. Les fonctions envoyées doivent
rester de niveau module, importables depuis le dossier ``backend``.
"""
from __future__ import annotations

import atexit
import json
import logging
import multiprocessing as mp
import os
import queue
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Callable, Optional

from services import canal_enfant

logger = logging.getLogger(__name__)

__all__ = ["TravailPdfiumEchoue", "executer", "signaler", "arreter", "etat",
           "attente_interactive_s", "attente_extraction_s",
           "AS_MO_DEFAUT", "TACHES_MAX_DEFAUT", "RSS_MAX_MO_DEFAUT",
           "ATTENTE_INTERACTIF_S", "ATTENTE_EXTRACTION_S"]

# Valeurs par défaut. Mesures du banc T9 (outils-pdf/banc_gueux.py, 99 pièces de Gueux) :
# - un enfant frais occupe 30 Mo de mémoire VIRTUELLE (pypdfium2 + document_processor chargés) ;
# - la pièce la plus lourde (plan vectoriel ARCH 12) le monte à 622 Mo virtuels, 603 Mo résidents ;
# - un PDF « bombe » de 1,5 Mo sur disque (1,5 Go de flux) fait avorter un enfant plafonné à 1,5 Go.
# Plafond par défaut : 1536 Mo, soit 2,5 fois la pièce la plus lourde mesurée. Sur le KVM 1
# (4 Go : Postgres, Redis, API, Celery, LibreOffice), un enfant ne peut ainsi jamais tenir
# plus de 1,5 Go, la bombe est refusée proprement, et la marge couvre les plans plus gros.
# Réglable : SYNORIX_PDFIUM_AS_MO (0 = aucun plafond, déconseillé).
AS_MO_DEFAUT = 1536
TACHES_MAX_DEFAUT = 40
RSS_MAX_MO_DEFAUT = 350
ATTENTE_INTERACTIF_S = 5          # attente d'une place, travail interactif (aperçu, ancre)
ATTENTE_EXTRACTION_S = 600        # attente d'une place, extraction au dépôt


class TravailPdfiumEchoue(Exception):
    """Le TRAVAIL a échoué (pas la fonction : ses exceptions sont relancées telles quelles).

    ``raison`` : ``"delai"`` (tué au bout de ``delai_s``), ``"memoire"`` (plafond atteint, ou arrêt natif par
    signal avec un plafond posé : voir ``_fin_anormale``), ``"plantage"`` (l'enfant s'est arrêté),
    ``"attente"`` (aucun processus libre à temps),
    ``"indisponible"`` (impossible de lancer l'enfant). ``detail`` : phrase pour les journaux
    (jamais de contenu du DCE)."""

    def __init__(self, raison: str, detail: str = "") -> None:
        super().__init__(raison, detail)
        self.raison = raison
        self.detail = detail

    def __str__(self) -> str:
        return f"travail PDFium échoué ({self.raison}{', ' + self.detail if self.detail else ''})"


# ─── Réglages (relus à chaque lancement d'enfant) ─────────────────────────────

def _entier(nom: str, defaut: int, minimum: int = 0) -> int:
    try:
        return max(minimum, int(os.environ.get(nom, "").strip() or defaut))
    except ValueError:
        return defaut


def nombre_de_processus() -> int:
    return _entier("SYNORIX_PDFIUM_PROCESSUS", 1)


def attente_interactive_s() -> float:
    return float(_entier("SYNORIX_PDFIUM_ATTENTE_S", ATTENTE_INTERACTIF_S, 0))


def attente_extraction_s() -> float:
    return float(_entier("SYNORIX_PDFIUM_ATTENTE_EXTRACTION_S", ATTENTE_EXTRACTION_S, 0))


def _plafond_as_octets() -> int:
    """Plafond de mémoire virtuelle de l'enfant, en octets (0 = aucun)."""
    return _entier("SYNORIX_PDFIUM_AS_MO", AS_MO_DEFAUT) * 1024 * 1024


def _reglages_enfant() -> dict:
    """Ce que le parent décide pour l'enfant (l'enfant n'a pas d'environnement : tout passe par ici).
    ``SYNORIX_PDFIUM_LANDLOCK`` : ``auto`` (défaut) ou ``aucun`` ; ``SYNORIX_PDFIUM_LECTURE_DIRS`` : dossiers de
    pièces en plus de ``backend/uploads`` (séparés par ``:``)."""
    actif = os.environ.get("SYNORIX_PDFIUM_LANDLOCK", "auto").strip().lower() != "aucun"
    dossiers = [d for d in os.environ.get("SYNORIX_PDFIUM_LECTURE_DIRS", "").split(":") if d.strip()]
    return {"landlock": actif, "lecture": [str(_RACINE_BACKEND / "uploads"), *dossiers]}


# ─── Côté enfant ──────────────────────────────────────────────────────────────

_conn_enfant = None   # dans l'enfant : sa moitié du tuyau


def signaler(objet: Any) -> None:
    """Dans l'enfant : remonte ``objet`` (picklable) vers ``sur_progression`` de l'appelant.
    Hors enfant (exécution directe) : ne fait rien. Ne casse jamais le travail."""
    if _conn_enfant is not None:
        try:
            canal_enfant.envoyer(_conn_enfant, ("prog", objet, 0))
        except Exception:  # noqa: BLE001 — l'avancement ne casse jamais le travail
            pass


def _rss_ko() -> int:
    try:
        with open("/proc/self/statm") as f:
            return int(f.read().split()[1]) * (os.sysconf("SC_PAGE_SIZE") // 1024)
    except (OSError, ValueError, IndexError):
        return 0


def _regles_landlock_enfant(lecture: list) -> list:
    """Règles Landlock de l'enfant, en LISTE BLANCHE (lecture seule partout, aucune écriture hors ``/dev/null``) :
    système et bibliothèques (``/usr``, ``/lib*``), l'installation de Python et son venv (``sys.prefix`` et
    voisins), le CODE de ``backend/services`` (jamais tout ``backend/`` : il contient ``.env``), la
    configuration de chargement de bibliothèques, ``/proc`` (sa propre mémoire résidente) et les dossiers
    de PIÈCES ``lecture`` (``backend/uploads``). Limite connue : ces dossiers couvrent TOUTES les organisations
    — l'enfant est partagé entre elles, une règle Landlock ne se resserre pas tâche par tâche ; seule la
    transmission du fichier par descripteur (au lieu du chemin) le permettrait."""
    from services import landlock as L
    racines = {sys.prefix, sys.base_prefix, sys.exec_prefix, "/usr", "/lib", "/lib64"}
    racine_backend = str(_RACINE_BACKEND)
    racines |= {p for p in sys.path if p and os.path.isdir(p) and os.path.realpath(p) != os.path.realpath(racine_backend)}
    regles = [(r, L.LECTURE_EXEC) for r in sorted(racines)]
    regles.append((str(_RACINE_BACKEND / "services"), L.LECTURE))
    regles += [(c, L.LECTURE) for c in ("/etc/ld.so.cache", "/etc/ld.so.conf", "/etc/ld.so.conf.d", "/etc/localtime",
                                        "/etc/passwd", "/etc/group", "/etc/nsswitch.conf", "/etc/mime.types", "/proc",
                                        "/dev/urandom", "/dev/random", "/dev/zero")]
    regles += [(c, L.LECTURE) for c in lecture]
    regles.append(("/dev/null", L.READ_FILE | L.WRITE_FILE))
    return regles


def _durcir_enfant(reglages: dict) -> str:
    """Pose le filtre seccomp (aucun connect : ni la base ni Redis par leur socket Unix ; aucun ptrace) puis
    Landlock. Renvoie le niveau obtenu, pour le journal du parent. Ne lève jamais : l'absence d'une protection
    est dite, pas cachée."""
    niveaux, refus = [], []
    try:
        from services import libreoffice_lanceur
        libreoffice_lanceur.poser_seccomp()
        niveaux.append("seccomp")
    except Exception as e:  # noqa: BLE001
        refus.append("seccomp: " + (getattr(e, "strerror", None) or type(e).__name__))
    try:
        from services import landlock
        landlock.restreindre(_regles_landlock_enfant(reglages.get("lecture", [])))
        niveaux.append("landlock")
    except Exception as e:  # noqa: BLE001
        refus.append("landlock: absent (" + (getattr(e, "strerror", None) or type(e).__name__) + ")")
    return ("+".join(niveaux) or "aucune") + (f" ({'; '.join(refus)})" if refus else "")


def _boucle_enfant(conn, plafond_as: int, reglages: Optional[dict] = None) -> None:
    """Point d'entrée de l'enfant : exécute les tâches reçues, une à la fois."""
    global _conn_enfant
    from services.durcissement import interdire_lecture_memoire
    interdire_lecture_memoire()
    # Chargé AVANT le plafond : les bibliothèques sont projetées une fois pour toutes.
    import services.pdf_lecture  # noqa: F401  (pypdfium2 + PDFium)
    import services.document_processor  # noqa: F401  (extraction : docx, tableurs)

    if plafond_as > 0:
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (plafond_as, plafond_as))
    _conn_enfant = conn
    if reglages and reglages.get("landlock"):
        canal_enfant.envoyer(conn, ("niveau", _durcir_enfant(reglages), 0))     # lu par le parent avant la 1re réponse
    while True:
        try:
            message = conn.recv()
        except EOFError:
            return
        except Exception as e:  # noqa: BLE001 — fonction introuvable, pickle illisible…
            _repondre(conn, "err", RuntimeError(f"tâche illisible : {type(e).__name__}"))
            continue
        if message is None:
            return
        fonction, args = message
        try:
            resultat = fonction(*args)
        except MemoryError:
            _repondre(conn, "memoire", None)
            continue
        except BaseException as e:  # noqa: BLE001 — tout est renvoyé à l'appelant
            _repondre(conn, "err", e)
            continue
        _repondre(conn, "ok", resultat)


def _repondre(conn, genre: str, valeur: Any) -> None:
    """Enfant -> parent : un message ``(genre, valeur, rss_ko)`` par ``canal_enfant.envoyer`` (bloc 6 : le parent
    ne désérialise QUE ce que ce filtre laisse passer, avec une borne de taille). Ce qui ne passe pas
    (exception hors liste, résultat non picklable ou trop gros) devient une ``RuntimeError`` claire chez l'appelant."""
    rss = _rss_ko()
    try:
        canal_enfant.envoyer(conn, (genre, valeur, rss))
        return
    except MemoryError:
        repli = ("memoire", None)
    except Exception as e:  # noqa: BLE001
        if genre == "err":
            repli = ("err", RuntimeError(f"{type(valeur).__name__}: {valeur}"[:2000]))
        else:
            repli = ("err", RuntimeError(f"résultat non transmissible : {type(e).__name__}"))
    canal_enfant.envoyer(conn, (repli[0], repli[1], rss))


# ─── Côté appelant ────────────────────────────────────────────────────────────

_RACINE_BACKEND = Path(__file__).resolve().parent.parent

# Ce que l'enfant reçoit de l'environnement de l'API : RIEN d'autre que ceci (liste blanche).
_ENV_ENFANT = {"PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"}

_AMORCE = (
    "import sys\n"
    "sys.path.insert(0, sys.argv[3])\n"
    "from multiprocessing.connection import Connection\n"
    "from services import pdfium_processus\n"
    "import json\n"
    "pdfium_processus._boucle_enfant(Connection(int(sys.argv[1])), int(sys.argv[2]), json.loads(sys.argv[4]))\n"
)


class _Lance:
    """Le processus enfant, avec l'interface de ``multiprocessing.Process`` que ``_Enfant`` utilise."""

    def __init__(self, conn_enfant, plafond_as: int, reglages: dict) -> None:
        fd = conn_enfant.fileno()
        self._popen = subprocess.Popen(
            [sys.executable, "-I", "-c", _AMORCE, str(fd), str(plafond_as), str(_RACINE_BACKEND),
             json.dumps(reglages)],
            env=dict(_ENV_ENFANT), pass_fds=(fd,), stdin=subprocess.DEVNULL, close_fds=True)

    @property
    def pid(self) -> int:
        return self._popen.pid

    @property
    def exitcode(self) -> Optional[int]:
        return self._popen.returncode        # négatif : tué par ce signal (comme multiprocessing)

    def is_alive(self) -> bool:
        return self._popen.poll() is None

    def kill(self) -> None:
        self._popen.kill()

    def join(self, timeout: Optional[float] = None) -> None:
        try:
            self._popen.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            pass


class _Enfant:
    def __init__(self) -> None:
        self.conn, enfant_conn = mp.Pipe(duplex=True)
        try:
            self.processus = _Lance(enfant_conn, _plafond_as_octets(), _reglages_enfant())
        except BaseException:
            self.conn.close()
            raise
        finally:
            enfant_conn.close()
        self.taches = 0
        self.rss_ko = 0

    @property
    def pid(self) -> Optional[int]:
        return self.processus.pid

    def vivant(self) -> bool:
        return self.processus.is_alive()

    def tuer(self) -> None:
        try:
            if self.processus.is_alive():
                self.processus.kill()
            self.processus.join(timeout=5)
        except Exception:  # noqa: BLE001
            pass
        try:
            self.conn.close()
        except Exception:  # noqa: BLE001
            pass

    def arreter(self) -> None:
        """Arrêt poli (fin de boucle), tué si l'enfant ne s'arrête pas."""
        try:
            self.conn.send(None)
            self.processus.join(timeout=5)
        except Exception:  # noqa: BLE001
            pass
        self.tuer()


class _Etat:
    """Les « places » : une par processus autorisé. Une place tient un ``_Enfant`` ou None
    (pas encore lancé, ou recyclé : il est relancé à la demande)."""

    def __init__(self) -> None:
        self.pid = os.getpid()
        self.nombre = nombre_de_processus()
        self.places: "queue.LifoQueue[Optional[_Enfant]]" = queue.LifoQueue()
        for _ in range(self.nombre):
            self.places.put(None)
        self.enfants: set = set()
        self.verrou = threading.Lock()


_etat: Optional[_Etat] = None
_verrou_etat = threading.Lock()


def _etat_courant() -> _Etat:
    """L'état du processus courant. Un worker Celery « prefork » hérite le module de son
    parent : l'état est refait quand le pid ou le réglage change."""
    global _etat
    with _verrou_etat:
        if _etat is None or _etat.pid != os.getpid() or _etat.nombre != nombre_de_processus():
            if _etat is not None and _etat.pid == os.getpid():
                _arreter_etat(_etat)
            _etat = _Etat()
        return _etat


def _arreter_etat(etat: _Etat) -> None:
    with etat.verrou:
        enfants = list(etat.enfants)
        etat.enfants.clear()
    for e in enfants:
        e.arreter()


atexit.register(lambda: arreter())     # l'enfant n'est plus un daemon de multiprocessing


def arreter() -> None:
    """Arrête les enfants (extinction propre, tests). Ils sont relancés à la demande."""
    global _etat
    with _verrou_etat:
        etat, _etat = _etat, None
    if etat is not None and etat.pid == os.getpid():
        _arreter_etat(etat)


def etat() -> dict:
    """Diagnostic : pid, mémoire résidente (Ko) et tâches faites des enfants vivants."""
    e = _etat
    if e is None or e.pid != os.getpid():
        return {"enfants": []}
    with e.verrou:
        return {"enfants": [{"pid": x.pid, "rss_ko": x.rss_ko, "taches": x.taches}
                            for x in e.enfants if x.vivant()]}


class _EnfantPerdu(Exception):
    def __init__(self, raison: str, detail: str = "") -> None:
        super().__init__(raison, detail)
        self.raison, self.detail = raison, detail


def executer(
    fonction: Callable[..., Any],
    *args: Any,
    delai_s: float,
    attente_s: Optional[float] = None,
    sur_progression: Optional[Callable[[Any], None]] = None,
) -> Any:
    """``fonction(*args)`` dans le processus pdfium ; son résultat, ou ``TravailPdfiumEchoue``.

    Bloquant. ``delai_s`` : durée maximale de l'EXÉCUTION (l'enfant est tué au-delà).
    ``attente_s`` : durée maximale d'attente d'une place (None : ``attente_interactive_s()``,
    5 s par défaut). L'attente est TOUJOURS bornée ; l'extraction passe ``attente_extraction_s()``.
    ``sur_progression(objet)`` reçoit, dans le thread de l'appelant, ce que l'enfant
    envoie par ``signaler``. Une exception de ``fonction`` est relancée telle quelle."""
    if nombre_de_processus() == 0:     # exécution directe, sans protection (réglage explicite)
        return fonction(*args)
    etat = _etat_courant()
    try:
        attente = attente_interactive_s() if attente_s is None else max(0.0, float(attente_s))
        enfant = etat.places.get(timeout=attente)
    except queue.Empty:
        raise TravailPdfiumEchoue("attente", f"aucun processus PDF libre en {attente:g} s") from None
    garder = False
    try:
        if enfant is not None and not enfant.vivant():
            _oublier(etat, enfant)
            enfant = None
        if enfant is None:
            try:
                enfant = _Enfant()
            except Exception as e:  # noqa: BLE001 — /dev/shm absent, limites système…
                raise TravailPdfiumEchoue("indisponible", type(e).__name__) from e
            with etat.verrou:
                etat.enfants.add(enfant)
        genre, valeur = _faire(enfant, fonction, args, delai_s, sur_progression)
        enfant.taches += 1
        if genre == "memoire":
            raise _EnfantPerdu("memoire", "plafond de mémoire atteint")
        garder = not _a_recycler(enfant)
        if genre == "err":
            raise valeur       # exception de la fonction, relancée telle quelle
        return valeur
    except _EnfantPerdu as e:
        raise TravailPdfiumEchoue(e.raison, e.detail) from None
    finally:
        if enfant is not None and not garder:
            _oublier(etat, enfant)
        etat.places.put(enfant if garder else None)


_GENRES = frozenset({"ok", "err", "memoire", "niveau", "prog"})      # les seuls genres qu'un enfant envoie
_SIGNAUX_DE_MEMOIRE = (6, 11, 7)    # SIGABRT, SIGSEGV, SIGBUS : ce que fait du code natif quand malloc échoue


def _fin_anormale(enfant: _Enfant, detail: str) -> "_EnfantPerdu":
    """L'enfant est mort sans réponse. Un PDF « bombe » arrêté par ``RLIMIT_AS`` ne laisse pas
    d'``MemoryError`` (le code natif de PDFium appelle ``abort``) : l'enfant meurt par SIGABRT, SIGSEGV
    ou SIGBUS. Avec un plafond posé, on dit alors « memoire » (cause PROBABLE, jamais prouvée : un
    vrai défaut de PDFium donnerait le même signal), sinon « plantage ». Les deux se traitent pareil
    (pièce non lisible, jamais relue dans l'API) ; la différence sert aux journaux."""
    code = enfant.processus.exitcode
    if code is not None and -code in _SIGNAUX_DE_MEMOIRE and _plafond_as_octets() > 0:
        return _EnfantPerdu("memoire", f"arrêt natif (signal {-code}) sous le plafond de mémoire")
    return _EnfantPerdu("plantage", detail)


def _journaliser_niveau(niveau: str) -> None:
    """Niveau d'isolation de l'enfant (sans donnée du DCE) ; un avertissement s'il manque une protection."""
    if niveau.startswith("seccomp+landlock") and "(" not in niveau:
        logger.info("Processus PDF isolé : %s", niveau)
    else:
        logger.warning("Processus PDF isolé INCOMPLÈTEMENT : %s", niveau)


def _a_recycler(enfant: _Enfant) -> bool:
    trop_de_taches = enfant.taches >= _entier("SYNORIX_PDFIUM_TACHES_MAX", TACHES_MAX_DEFAUT, 1)
    trop_de_memoire = enfant.rss_ko >= _entier("SYNORIX_PDFIUM_RSS_MAX_MO", RSS_MAX_MO_DEFAUT, 1) * 1024
    if trop_de_taches or trop_de_memoire:
        logger.info("Processus PDF recyclé (%d tâches, %d Mo résidents)", enfant.taches, enfant.rss_ko // 1024)
    return trop_de_taches or trop_de_memoire


def _oublier(etat: _Etat, enfant: _Enfant) -> None:
    with etat.verrou:
        etat.enfants.discard(enfant)
    enfant.tuer()


def _faire(enfant: _Enfant, fonction, args, delai_s: float, sur_progression) -> tuple[str, Any]:
    """Envoie la tâche, attend la réponse : ``(genre, valeur)`` avec genre ``ok``, ``err`` ou
    ``memoire``. Lève ``_EnfantPerdu`` si l'enfant est mort ou tué au délai."""
    echeance = time.monotonic() + delai_s
    try:
        enfant.conn.send((fonction, args))
    except (BrokenPipeError, OSError):
        raise _EnfantPerdu("plantage", "tuyau fermé avant l'envoi") from None
    while True:
        restant = echeance - time.monotonic()
        if restant <= 0:
            enfant.tuer()
            raise _EnfantPerdu("delai", f"plus de {delai_s:g} s")
        if not enfant.conn.poll(min(restant, 1.0)):
            if not enfant.vivant():
                raise _fin_anormale(enfant, f"code de sortie {enfant.processus.exitcode}")
            continue
        # Lecture d'un message de l'enfant : taille bornée, désérialisation filtrée (services/canal_enfant.py).
        # Un enfant qui n'envoie qu'une partie du message ferait attendre cette lecture au-delà du délai :
        # un minuteur le tue alors, ce qui ferme le tuyau et réveille la lecture.
        minuteur = threading.Timer(max(0.05, echeance - time.monotonic()), enfant.tuer)
        minuteur.daemon = True
        minuteur.start()
        try:
            message = canal_enfant.recevoir(enfant.conn)
        except canal_enfant.MessageRefuse as e:
            enfant.tuer()      # flux désynchronisé ou enfant hostile : on ne le réutilise jamais
            raise _EnfantPerdu("plantage", f"réponse de l'enfant refusée ({e.detail})") from None
        except (EOFError, OSError):
            if time.monotonic() >= echeance:
                raise _EnfantPerdu("delai", f"plus de {delai_s:g} s") from None
            enfant.processus.join(timeout=2)
            raise _fin_anormale(enfant, f"code de sortie {enfant.processus.exitcode}") from None
        finally:
            minuteur.cancel()
        try:
            genre, valeur, rss_ko = message
            conforme = (genre in _GENRES and isinstance(rss_ko, int) and not isinstance(rss_ko, bool)
                        and (genre != "err" or isinstance(valeur, BaseException))
                        and (genre != "niveau" or isinstance(valeur, str)))
        except (TypeError, ValueError):
            conforme = False
        if not conforme:
            enfant.tuer()
            raise _EnfantPerdu("plantage", "réponse de l'enfant hors protocole")
        if genre == "niveau":
            _journaliser_niveau("".join(c for c in valeur[:200] if c.isprintable()))
            continue
        if genre == "prog":
            if sur_progression is not None:
                try:
                    sur_progression(valeur)
                except Exception:  # noqa: BLE001 — l'avancement ne casse jamais le travail
                    pass
            continue
        enfant.rss_ko = rss_ko
        return genre, valeur
