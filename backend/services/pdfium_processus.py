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
- contexte « spawn » (jamais de fork d'un processus qui a des threads) ;
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

``ma_fonction`` est une fonction de NIVEAU MODULE (elle voyage par référence) ; arguments et
résultat doivent être picklables. Une exception de la fonction est relancée telle quelle chez
l'appelant ; un échec du TRAVAIL (délai, plantage, mémoire) lève ``TravailPdfiumEchoue`` et
l'API reste debout. Dans l'enfant, ``signaler(objet)`` remonte un avancement vers le
paramètre ``sur_progression`` de l'appelant.

ATTENTION (contexte spawn) : tout script qui appelle ce module dans son propre processus doit
protéger son code par ``if __name__ == "__main__":`` (uvicorn, Celery et pytest le font déjà).
"""
from __future__ import annotations

import logging
import multiprocessing as mp
import os
import queue
import threading
import time
from typing import Any, Callable, Optional

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

    ``raison`` : ``"delai"`` (tué au bout de ``delai_s``), ``"memoire"`` (plafond atteint),
    ``"plantage"`` (l'enfant s'est arrêté), ``"attente"`` (aucun processus libre à temps),
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


# ─── Côté enfant ──────────────────────────────────────────────────────────────

_conn_enfant = None   # dans l'enfant : sa moitié du tuyau


def signaler(objet: Any) -> None:
    """Dans l'enfant : remonte ``objet`` (picklable) vers ``sur_progression`` de l'appelant.
    Hors enfant (exécution directe) : ne fait rien. Ne casse jamais le travail."""
    if _conn_enfant is not None:
        try:
            _conn_enfant.send(("prog", objet, 0))
        except Exception:  # noqa: BLE001 — l'avancement ne casse jamais le travail
            pass


def _rss_ko() -> int:
    try:
        with open("/proc/self/statm") as f:
            return int(f.read().split()[1]) * (os.sysconf("SC_PAGE_SIZE") // 1024)
    except (OSError, ValueError, IndexError):
        return 0


def _boucle_enfant(conn, plafond_as: int) -> None:
    """Point d'entrée de l'enfant : exécute les tâches reçues, une à la fois."""
    global _conn_enfant
    # Chargé AVANT le plafond : les bibliothèques sont projetées une fois pour toutes.
    import services.pdf_lecture  # noqa: F401  (pypdfium2 + PDFium)
    import services.document_processor  # noqa: F401  (extraction : docx, tableurs)

    if plafond_as > 0:
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (plafond_as, plafond_as))
    _conn_enfant = conn
    while True:
        try:
            message = conn.recv()
        except EOFError:
            return
        except Exception as e:  # noqa: BLE001 — fonction introuvable, pickle illisible…
            conn.send(("err", RuntimeError(f"tâche illisible : {type(e).__name__}"), _rss_ko()))
            continue
        if message is None:
            return
        fonction, args = message
        try:
            resultat = fonction(*args)
        except MemoryError:
            conn.send(("memoire", None, _rss_ko()))
            continue
        except BaseException as e:  # noqa: BLE001 — tout est renvoyé à l'appelant
            try:
                conn.send(("err", e, _rss_ko()))
            except Exception:  # noqa: BLE001 — exception non picklable
                conn.send(("err", RuntimeError(f"{type(e).__name__}: {e}"), _rss_ko()))
            continue
        try:
            conn.send(("ok", resultat, _rss_ko()))
        except MemoryError:
            conn.send(("memoire", None, _rss_ko()))
        except Exception as e:  # noqa: BLE001 — résultat non picklable
            conn.send(("err", RuntimeError(f"résultat non transmissible : {type(e).__name__}"), _rss_ko()))


# ─── Côté appelant ────────────────────────────────────────────────────────────

class _Enfant:
    def __init__(self) -> None:
        ctx = mp.get_context("spawn")
        self.conn, enfant_conn = ctx.Pipe(duplex=True)
        self.processus = ctx.Process(target=_boucle_enfant, args=(enfant_conn, _plafond_as_octets()),
                                     daemon=True, name="synorix-pdfium")
        self.processus.start()
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
                raise _EnfantPerdu("plantage", f"code de sortie {enfant.processus.exitcode}")
            continue
        try:
            genre, valeur, rss_ko = enfant.conn.recv()
        except (EOFError, OSError):
            enfant.processus.join(timeout=2)
            raise _EnfantPerdu("plantage", f"code de sortie {enfant.processus.exitcode}") from None
        if genre == "prog":
            if sur_progression is not None:
                try:
                    sur_progression(valeur)
                except Exception:  # noqa: BLE001 — l'avancement ne casse jamais le travail
                    pass
            continue
        enfant.rss_ko = rss_ko
        return genre, valeur
