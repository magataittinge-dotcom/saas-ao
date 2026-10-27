"""Canal entre l'API et l'enfant PDFium : ce que le PARENT accepte de désérialiser.

Problème (revue de sécurité, bloc 6). Le parent lisait les réponses de l'enfant par
``Connection.recv()``, c'est-à-dire ``pickle.loads`` sur des octets fabriqués par l'enfant. L'enfant lit
des fichiers déposés par les clients : on part de l'hypothèse qu'un fichier piégé en prend le contrôle.
Un pickle forgé (``__reduce__`` vers ``os.system``…) s'exécutait alors DANS l'API, avec ses secrets, sa
base et ses fichiers : toute l'isolation (seccomp, Landlock, environnement minimal) était contournée.

Correctif. Le sens enfant -> parent ne passe plus que par ``recevoir`` :

- ``recv_bytes(MESSAGE_MAX_OCTETS)`` : la taille est lue AVANT le contenu ; un message plus gros est
  refusé sans être alloué (un enfant compromis ne gonfle pas la mémoire de l'API) ;
- un ``pickle.Unpickler`` RESTREINT : ``find_class`` n'accepte que la liste fermée ``_CLASSES_AUTORISEES``
  (exceptions de la bibliothèque standard que les travaux lèvent réellement, et les 4 exceptions du projet
  levées dans l'enfant). Les types de base (str, bytes, int, float, bool, None, tuple, list, dict, set)
  n'ont besoin d'aucune classe : ils ne passent par aucun ``find_class``. Aucune fonction, aucun module,
  aucun ``getattr`` n'est atteignable, donc aucun ``REDUCE`` dangereux ;
- un décompte d'OPCODES (``pickletools.genops``, sans rien construire) borne l'amplification : un pickle
  de 1 octet par objet ne fabrique pas des dizaines de fois sa taille en mémoire.

Le sens parent -> enfant reste ``Connection.send`` / ``recv`` (pickle) : le parent est de confiance, et
l'enfant doit exécuter ce qu'il demande (fonction de niveau module + arguments). L'enfant vérifie aussi, avant
d'envoyer, que son message passerait ce filtre (``encoder``) : un résultat ou une exception hors liste devient
une ``RuntimeError`` claire chez l'appelant, comme avant pour un résultat non picklable.

Taille maximale d'un message (``MESSAGE_MAX_OCTETS``) : 32 Mo. MESURÉ (outils-secu/mesure_tailles.py, 114 pièces
distinctes du DCE de démonstration) : le plus gros résultat d'extraction fait 0,42 Mo (texte + texte de chaque
page), un aperçu WebP de 1 600 px au plus 0,33 Mo, au maximum autorisé (4 096 px, 16 Mpx) 1,2 Mo. La borne laisse
~75 fois le plus gros résultat mesuré (un DCE de plusieurs milliers de pages tient dans quelques Mo de texte) et
reste très en dessous de la mémoire de l'API. Constante, sans réglage d'environnement : l'enfant n'a pas
d'environnement et doit appliquer la même borne que le parent.
"""
from __future__ import annotations

import importlib
import io
import pickle
import pickletools
from typing import Any

__all__ = ["MessageRefuse", "MESSAGE_MAX_OCTETS_DEFAUT", "OPCODES_MAX", "message_max_octets",
           "encoder", "decoder", "envoyer", "recevoir", "exception_autorisee"]

MESSAGE_MAX_OCTETS_DEFAUT = 32 * 1024 * 1024
OPCODES_MAX = 1_000_000          # un résultat légitime en compte quelques milliers (une entrée par page ou par ancre)
_PROTOCOLE = 4                   # trames, sans classe pour str/bytes/tuple/set/frozenset


class MessageRefuse(Exception):
    """Un message de l'enfant n'est pas acceptable (trop gros, hors liste, mal formé). ``detail`` : phrase pour
    les journaux (jamais de contenu du message)."""

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


# Liste FERMÉE des classes qu'un message de l'enfant peut nommer. Uniquement des exceptions (c'est tout ce
# qu'un travail relance) : leur construction ``classe(*args)`` n'a pas d'effet de bord. Ajouter une entrée ici
# demande de vérifier que la classe se construit sans effet de bord depuis des arguments hostiles.
_CLASSES_AUTORISEES: dict[tuple[str, str], bool] = {}
for _nom in ("Exception", "ValueError", "TypeError", "KeyError", "IndexError", "LookupError", "AttributeError",
             "RuntimeError", "NotImplementedError", "RecursionError", "MemoryError", "OverflowError",
             "ZeroDivisionError", "ArithmeticError", "AssertionError", "EOFError", "UnicodeError",
             "UnicodeDecodeError", "UnicodeEncodeError", "OSError", "FileNotFoundError", "PermissionError",
             "IsADirectoryError", "NotADirectoryError", "FileExistsError", "TimeoutError", "BrokenPipeError",
             "InterruptedError", "ConnectionError", "bytearray"):
    _CLASSES_AUTORISEES[("builtins", _nom)] = True
for _nom in ("PdfIllisible",):
    _CLASSES_AUTORISEES[("services.pdf_lecture", _nom)] = True
for _nom in ("RenduRefuse", "PageHorsBornes", "RenduTropGrand"):
    _CLASSES_AUTORISEES[("services.pdf_rendu", _nom)] = True
# Archives hors mesure : la garde anti-zip-bomb lève ArchiveDemesuree (ValueError) dans l'enfant
_CLASSES_AUTORISEES[("services.garde_archives", "ArchiveDemesuree")] = True


def exception_autorisee(exc: BaseException) -> bool:
    """Vrai si la CLASSE de l'exception passe le filtre (module + nom exacts)."""
    t = type(exc)
    return (t.__module__, t.__qualname__) in _CLASSES_AUTORISEES


class _Restreint(pickle.Unpickler):
    def find_class(self, module: str, name: str) -> Any:        # noqa: D102
        if (module, name) not in _CLASSES_AUTORISEES:
            raise MessageRefuse(f"classe refusée : {module}.{name}"[:120])
        return getattr(importlib.import_module(module), name)

    def persistent_load(self, pid: Any) -> Any:                 # noqa: D102
        raise MessageRefuse("référence persistante refusée")


def message_max_octets() -> int:
    return MESSAGE_MAX_OCTETS_DEFAUT


def _compter_opcodes(octets: bytes) -> None:
    n = 0
    for _ in pickletools.genops(octets):
        n += 1
        if n > OPCODES_MAX:
            raise MessageRefuse("trop d'objets dans le message")


def decoder(octets: bytes) -> Any:
    """Désérialise ``octets`` avec le filtre. Lève ``MessageRefuse`` pour tout ce qui n'est pas un message
    acceptable (classe hors liste, trop d'objets, pickle mal formé, récursion)."""
    try:
        _compter_opcodes(octets)
        return _Restreint(io.BytesIO(octets)).load()
    except MessageRefuse:
        raise
    except Exception as e:  # noqa: BLE001 — pickle mal formé, arguments d'exception invalides, récursion…
        raise MessageRefuse(f"message illisible ({type(e).__name__})") from None


def encoder(message: Any) -> bytes:
    """Sérialise ``message`` ET vérifie que le parent l'acceptera (même filtre, même borne). Lève ce que lève
    ``pickle`` (objet non picklable) ou ``MessageRefuse`` (classe hors liste, trop gros)."""
    octets = pickle.dumps(message, protocol=_PROTOCOLE)
    if len(octets) > message_max_octets():
        raise MessageRefuse(f"message de {len(octets)} octets : plus que la borne de {message_max_octets()}")
    decoder(octets)
    return octets


def envoyer(conn: Any, message: Any) -> None:
    """Enfant -> parent : ``message`` en octets, après vérification par ``encoder``."""
    conn.send_bytes(encoder(message))


def recevoir(conn: Any) -> Any:
    """Parent : lit UN message de l'enfant, jamais plus de ``message_max_octets()`` octets en mémoire.
    Lève ``MessageRefuse`` (trop gros, hors liste, mal formé), ``EOFError`` / ``OSError`` (tuyau fermé)."""
    try:
        octets = conn.recv_bytes(message_max_octets())
    except OSError as e:
        if "bad message length" in str(e):       # multiprocessing.connection : taille annoncée > maxlength
            raise MessageRefuse("message plus gros que la borne") from None
        raise
    return decoder(octets)
