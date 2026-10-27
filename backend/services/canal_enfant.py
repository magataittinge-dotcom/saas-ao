"""Canal entre l'API et l'enfant PDFium : ce que le PARENT accepte de lire.

Problème (revue de sécurité, bloc 6). Le parent lisait les réponses de l'enfant par ``Connection.recv()``, c'est-à-dire
``pickle.loads`` sur des octets fabriqués par l'enfant. L'enfant lit des fichiers déposés par les clients : on part de
l'hypothèse qu'un fichier piégé en prend le contrôle. Un pickle forgé (``__reduce__`` vers ``os.system``…) s'exécutait
alors DANS l'API, avec ses secrets, sa base et ses fichiers : seccomp, Landlock et l'environnement minimal étaient
contournés.

Première réponse (``ec45895``) : un ``pickle.Unpickler`` restreint par ``find_class``. Insuffisant, relevé par la revue :
un pickle reste un langage de construction d'objets. ``bytearray(10**12)`` tient en 8 octets (la borne de taille ne
l'arrête pas, l'API alloue 1 To) ; des clés entières au hachage identique font passer un ``dict`` en O(n²) (le hachage des
entiers est déterministe) ; il en va de même des ``set``. Durcir la liste ne ferme pas la famille.

Réponse retenue : le sens enfant -> parent ne porte PLUS DU TOUT de pickle, c'est du JSON avec un schéma explicite.

- Aucun objet n'est construit à partir d'un nom : les types possibles sont ceux de JSON (``str``, ``int``, ``float``,
  ``bool``, ``None``, ``list``, ``dict``) plus trois balises d'une seule clé : ``{"$t": [...]}`` (tuple),
  ``{"$b": "<base64>"}`` (octets, ex. l'aperçu WebP), ``{"$e": "<nom>", "a": [...]}`` (exception).
- Les clés d'un ``dict`` sont toujours des ``str`` : leur hachage est aléatoire par processus, aucune collision
  fabricable à l'avance. Aucun ``set``. Un ``dict`` du résultat dont une clé commence par ``$`` est refusé à l'envoi
  (jamais confondu avec une balise).
- Une exception est nommée (``module.Classe``) dans la liste FERMÉE ``_EXCEPTIONS`` (celles que les travaux lèvent
  réellement : exceptions de la bibliothèque standard, ``PdfIllisible``, ``RenduRefuse`` et ses filles,
  ``ArchiveDemesuree``). Le parent la reconstruit par ``classe(*args)`` avec au plus 8 arguments, chacun ``str`` de 4 096
  caractères au plus, ``int`` de 63 bits ou ``None`` : aucun de ces constructeurs n'alloue d'après un entier.
  ``OSError`` et ses filles gardent leur ``filename`` (3e argument). Hors liste, côté enfant : ``RuntimeError`` claire.
- Bornes, appliquées par le parent AVANT toute construction : taille du message (``recv_bytes(MESSAGE_MAX_OCTETS)`` :
  l'en-tête de trame est lu avant le contenu, un message plus gros n'est jamais alloué), nombre d'ouvertures de liste ou
  d'objet (``STRUCTURES_MAX``, décompte à la vitesse du C sur les octets), nombre de séparateurs (``SEPARATEURS_MAX``),
  profondeur d'imbrication (``PROFONDEUR_MAX``). L'enfant applique les mêmes bornes avant d'envoyer.

Le sens parent -> enfant reste ``Connection.send`` / ``recv`` (pickle) : le parent est de confiance, et l'enfant doit
exécuter ce qu'il demande (fonction de niveau module + arguments).

Bornes choisies. Taille d'un message : 16 Mo. MESURÉ (outils-secu/mesure_json.py, pièces distinctes du DCE de
démonstration, message JSON tel qu'envoyé, décodage identique à l'objet d'origine) : plus gros résultat d'extraction
0,48 Mo (texte + texte de chaque page) ; aperçu WebP de 1 600 px 0,44 Mo (base64 compris) ; au maximum autorisé
(4 096 px, 16 Mpx) 1,57 Mo. La borne laisse ~33 fois le plus gros résultat mesuré et ~10 fois le plus gros aperçu.
Structures (500 000 ouvertures de liste ou d'objet) et séparateurs (4 millions) : plus de 20 fois ce qu'un résultat
légitime contient, et bornent la mémoire construite à quelques centaines de Mo au pire (au lieu d'un facteur
non borné). Constantes, sans réglage d'environnement : l'enfant n'a pas d'environnement et applique les mêmes bornes.
"""
from __future__ import annotations

import base64
import binascii
import importlib
import json
from typing import Any

__all__ = ["MessageRefuse", "MESSAGE_MAX_OCTETS", "STRUCTURES_MAX", "SEPARATEURS_MAX", "PROFONDEUR_MAX",
           "encoder", "decoder", "envoyer", "recevoir", "exception_autorisee"]

MESSAGE_MAX_OCTETS = 16 * 1024 * 1024
STRUCTURES_MAX = 500_000          # « [ » et « { » ouverts : un résultat légitime en compte quelques milliers
SEPARATEURS_MAX = 4_000_000       # « , » : le texte d'un gros DCE (quelques Mo) en contient quelques centaines de milliers
PROFONDEUR_MAX = 32               # un résultat légitime : 6 niveaux
_ARGS_MAX, _CHAINE_MAX = 8, 4096


class MessageRefuse(Exception):
    """Un message de l'enfant n'est pas acceptable (trop gros, hors schéma, mal formé). ``detail`` : phrase pour les
    journaux (jamais de contenu du message)."""

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


# Liste FERMÉE des exceptions qu'un message de l'enfant peut nommer : (module, nom). Chaque constructeur se
# construit sans effet de bord depuis des arguments str/int/None bornés.
_EXCEPTIONS: dict[str, tuple[str, str]] = {}
for _nom in ("Exception", "ValueError", "TypeError", "KeyError", "IndexError", "LookupError", "AttributeError",
             "RuntimeError", "NotImplementedError", "RecursionError", "MemoryError", "OverflowError",
             "ZeroDivisionError", "ArithmeticError", "AssertionError", "EOFError", "OSError", "FileNotFoundError",
             "PermissionError", "IsADirectoryError", "NotADirectoryError", "FileExistsError", "TimeoutError",
             "BrokenPipeError", "InterruptedError", "ConnectionError"):
    _EXCEPTIONS[f"builtins.{_nom}"] = ("builtins", _nom)
_EXCEPTIONS["services.pdf_lecture.PdfIllisible"] = ("services.pdf_lecture", "PdfIllisible")
for _nom in ("RenduRefuse", "PageHorsBornes", "RenduTropGrand"):
    _EXCEPTIONS[f"services.pdf_rendu.{_nom}"] = ("services.pdf_rendu", _nom)
_EXCEPTIONS["services.garde_archives.ArchiveDemesuree"] = ("services.garde_archives", "ArchiveDemesuree")
_CLE_PAR_CLASSE: dict[tuple[str, str], str] = {v: k for k, v in _EXCEPTIONS.items()}


def _cle_exception(exc: BaseException) -> str | None:
    t = type(exc)
    return _CLE_PAR_CLASSE.get((t.__module__, t.__qualname__))


def exception_autorisee(exc: BaseException) -> bool:
    """Vrai si la CLASSE de l'exception est dans la liste fermée (module + nom exacts)."""
    return _cle_exception(exc) is not None


def _arguments(exc: BaseException) -> list:
    args = list(exc.args)
    if isinstance(exc, OSError) and isinstance(exc.filename, str) and len(args) == 2:
        args.append(exc.filename)             # le nom du fichier n'est pas dans args : il voyage en 3e argument
    return args


# ─── Encodage (enfant) ───────────────────────────────────────────────────────

def _vers_json(v: Any, profondeur: int = 0) -> Any:
    if profondeur > PROFONDEUR_MAX:
        raise MessageRefuse("imbrication trop profonde")
    if v is None or isinstance(v, (bool, str)):
        return v
    if isinstance(v, int):
        return int(v)
    if isinstance(v, float):
        return float(v)
    if isinstance(v, (bytes, bytearray)):
        return {"$b": base64.b64encode(bytes(v)).decode("ascii")}
    if isinstance(v, tuple):
        return {"$t": [_vers_json(x, profondeur + 1) for x in v]}
    if isinstance(v, list):
        return [_vers_json(x, profondeur + 1) for x in v]
    if isinstance(v, dict):
        sortie = {}
        for cle, x in v.items():
            if not isinstance(cle, str):
                raise TypeError(f"clé de dict non textuelle ({type(cle).__name__})")
            if cle.startswith("$"):
                raise TypeError("clé de dict réservée (« $… »)")
            sortie[cle] = _vers_json(x, profondeur + 1)
        return sortie
    if isinstance(v, BaseException):
        cle = _cle_exception(v)
        if cle is None:
            raise TypeError(f"exception hors liste ({type(v).__name__})")
        args = _arguments(v)
        if len(args) > _ARGS_MAX or not all(_argument_valide(a) for a in args):
            raise TypeError("arguments d'exception non transmissibles")
        return {"$e": cle, "a": args}
    raise TypeError(f"type non transmissible ({type(v).__name__})")


def _argument_valide(a: Any) -> bool:
    if a is None:
        return True
    if isinstance(a, bool):
        return False
    if isinstance(a, int):
        return -(2 ** 63) <= a < 2 ** 63
    return isinstance(a, str) and len(a) <= _CHAINE_MAX


def _verifier_bornes(octets: bytes) -> None:
    """Décompte sur les octets (à la vitesse du C), AVANT de construire quoi que ce soit : un JSON de
    « [[],[],… » ne fabrique pas des dizaines de fois sa taille en mémoire."""
    if len(octets) > MESSAGE_MAX_OCTETS:
        raise MessageRefuse(f"message de {len(octets)} octets : plus que la borne de {MESSAGE_MAX_OCTETS}")
    if octets.count(b"[") + octets.count(b"{") > STRUCTURES_MAX:
        raise MessageRefuse("trop de structures dans le message")
    if octets.count(b",") > SEPARATEURS_MAX:
        raise MessageRefuse("trop d'éléments dans le message")


def encoder(message: Any) -> bytes:
    """Sérialise ``message`` ET applique les bornes du parent. Lève ``TypeError`` (type, clé ou exception hors
    schéma) ou ``MessageRefuse`` (trop gros, trop profond)."""
    octets = json.dumps(_vers_json(message), separators=(",", ":"), allow_nan=True).encode("ascii")
    _verifier_bornes(octets)
    return octets


# ─── Décodage (parent) ───────────────────────────────────────────────────────

class _Compteur:
    def __init__(self) -> None:
        self.n = 0

    def pas(self) -> None:
        self.n += 1
        if self.n > STRUCTURES_MAX + SEPARATEURS_MAX:
            raise MessageRefuse("trop d'éléments dans le message")


def _depuis_json(v: Any, profondeur: int, compteur: _Compteur) -> Any:
    compteur.pas()
    if profondeur > PROFONDEUR_MAX:
        raise MessageRefuse("imbrication trop profonde")
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, list):
        return [_depuis_json(x, profondeur + 1, compteur) for x in v]
    if isinstance(v, dict):
        if "$t" in v or "$b" in v or "$e" in v:
            return _balise(v, profondeur, compteur)
        for cle in v:
            if cle.startswith("$"):
                raise MessageRefuse("balise inconnue")
        return {cle: _depuis_json(x, profondeur + 1, compteur) for cle, x in v.items()}
    raise MessageRefuse("type inattendu")


def _balise(v: dict, profondeur: int, compteur: _Compteur) -> Any:
    if set(v) == {"$t"} and isinstance(v["$t"], list):
        return tuple(_depuis_json(x, profondeur + 1, compteur) for x in v["$t"])
    if set(v) == {"$b"} and isinstance(v["$b"], str):
        try:
            return base64.b64decode(v["$b"].encode("ascii"), validate=True)
        except (binascii.Error, UnicodeEncodeError):
            raise MessageRefuse("octets mal formés") from None
    if set(v) == {"$e", "a"} and isinstance(v["$e"], str) and isinstance(v["a"], list):
        cible = _EXCEPTIONS.get(v["$e"])
        args = v["a"]
        if cible is None:
            raise MessageRefuse("exception hors liste")
        if len(args) > _ARGS_MAX or not all(_argument_valide(a) for a in args):
            raise MessageRefuse("arguments d'exception refusés")
        try:
            return getattr(importlib.import_module(cible[0]), cible[1])(*args)
        except Exception:  # noqa: BLE001 — arguments qui ne conviennent pas au constructeur
            raise MessageRefuse("exception mal formée") from None
    raise MessageRefuse("balise mal formée")


def decoder(octets: bytes) -> Any:
    """Lit ``octets`` : JSON strict, bornes, balises. Lève ``MessageRefuse`` pour tout ce qui n'est pas un
    message acceptable (trop gros, pas du JSON, hors schéma). Aucun nom n'est résolu hors ``_EXCEPTIONS``."""
    try:
        _verifier_bornes(octets)
        brut = json.loads(octets.decode("utf-8"))
        return _depuis_json(brut, 0, _Compteur())
    except MessageRefuse:
        raise
    except Exception as e:  # noqa: BLE001 — pas du JSON, UTF-8 invalide, récursion…
        raise MessageRefuse(f"message illisible ({type(e).__name__})") from None


def envoyer(conn: Any, message: Any) -> None:
    """Enfant -> parent : ``message`` en JSON, après application des bornes du parent."""
    conn.send_bytes(encoder(message))


def recevoir(conn: Any) -> Any:
    """Parent : lit UN message de l'enfant, jamais plus de ``MESSAGE_MAX_OCTETS`` octets en mémoire. Lève
    ``MessageRefuse`` (trop gros, hors schéma, mal formé), ``EOFError`` / ``OSError`` (tuyau fermé)."""
    try:
        octets = conn.recv_bytes(MESSAGE_MAX_OCTETS)
    except OSError as e:
        if "bad message length" in str(e):       # multiprocessing.connection : taille annoncée > maxlength
            raise MessageRefuse("message plus gros que la borne") from None
        raise
    return decoder(octets)
