"""Chronométrage des étapes du parcours (bloc 12) : UNE ligne de journal par étape terminée.

Format stable, une ligne, lisible par ``scripts/chrono_tableau.py`` ::

    chrono etape=analyse projet=<id> lot=<id> duree_ms=12345 statut=ok

- ``etape`` : ``depot`` | ``lecture`` | ``lots`` | ``analyse`` | ``memoire`` | ``export``
  (``analyse_lot`` : le détail d'un lot dans l'analyse, en plus de la ligne ``analyse`` du run entier) ;
- ``projet`` : l'identifiant du projet ; ``lot`` : l'identifiant du lot (plusieurs : joints par ``+``), ``-`` si sans objet ;
- ``duree_ms`` : durée réelle (horloge monotone) du début à la fin de l'étape ;
- ``statut`` : ``ok``, ``erreur`` (une exception a traversé l'étape) ou ``interrompu``.

AUCUNE donnée personnelle ni texte du DCE : seulement des identifiants (réduits à ``[A-Za-z0-9_.+-]``, 60 signes au
plus), jamais un nom de fichier, de projet, d'entreprise ni un extrait. L'émission ne lève jamais : un journal en
panne ne casse pas une étape.

Pose : ``@chronometre("analyse")`` sur la fonction qui exécute l'étape (route ou tâche de fond ; fonctions
synchrones ou ``async``), ou ``with chrono("analyse", projet, lot):`` autour d'un bloc.
"""
from __future__ import annotations

import functools
import inspect
import logging
import re
import time
from contextlib import contextmanager
from typing import Any, Callable, Iterator

logger = logging.getLogger("synorix.chrono")

ETAPES = ("depot", "lecture", "lots", "analyse", "memoire", "export")

_INTERDIT = re.compile(r"[^A-Za-z0-9_.+-]")


def identifiant(valeur: Any) -> str:
    """Identifiant sûr pour le journal : ``-`` si vide, sinon réduit aux signes sans risque."""
    if valeur is None or valeur == "":
        return "-"
    if isinstance(valeur, (list, tuple, set)):
        valeur = "+".join(str(v) for v in valeur)
    return _INTERDIT.sub("_", str(valeur))[:60] or "-"


def ligne(etape: str, projet: Any, lot: Any, duree_ms: int, statut: str) -> str:
    return f"chrono etape={identifiant(etape)} projet={identifiant(projet)} lot={identifiant(lot)} duree_ms={int(duree_ms)} statut={statut}"


def _emettre(etape: str, projet: Any, lot: Any, debut: float, statut: str) -> None:
    try:
        logger.info(ligne(etape, projet, lot, round((time.perf_counter() - debut) * 1000), statut))
    except Exception:  # un journal en panne ne casse jamais une étape
        pass


@contextmanager
def chrono(etape: str, projet: Any = None, lot: Any = None) -> Iterator[None]:
    debut = time.perf_counter()
    statut = "ok"
    try:
        yield
    except Exception:
        statut = "erreur"
        raise
    except BaseException:
        statut = "interrompu"
        raise
    finally:
        _emettre(etape, projet, lot, debut, statut)


def lot_du_projet(args: dict) -> str:
    """Le lot choisi du projet (``selected_lot``), lu avec la session ``db`` de la route si elle existe.
    ``-`` au moindre doute : le chronométrage ne doit jamais coûter une erreur."""
    try:
        from models.project import Project
        projet = args.get("project_id")
        db = args.get("db")
        if db is not None:
            valeur = db.query(Project.selected_lot).filter(Project.id == projet).scalar()
        else:
            from database import SessionLocal
            session = SessionLocal()
            try:
                valeur = session.query(Project.selected_lot).filter(Project.id == projet).scalar()
            finally:
                session.close()
        return identifiant(valeur)
    except Exception:
        return "-"


def chronometre(etape: str, *, lot: Callable[[dict], Any] | None = None, projet: str = "project_id") -> Callable:
    """Décorateur : une ligne ``chrono`` à la fin de la fonction. ``projet`` : nom du paramètre qui porte
    l'identifiant du projet. ``lot`` : fonction des arguments nommés (``dict``) qui rend l'identifiant du lot."""

    def poser(fonction: Callable) -> Callable:
        signature = inspect.signature(fonction)

        def contexte(args: tuple, kwargs: dict) -> tuple[Any, Any]:
            try:
                liaison = signature.bind_partial(*args, **kwargs)
                liaison.apply_defaults()
                nommes = dict(liaison.arguments)
                return nommes.get(projet), (lot(nommes) if lot else None)
            except Exception:
                return None, None

        if inspect.iscoroutinefunction(fonction):
            @functools.wraps(fonction)
            async def enveloppe_async(*args: Any, **kwargs: Any) -> Any:
                p, l = contexte(args, kwargs)
                with chrono(etape, p, l):
                    return await fonction(*args, **kwargs)
            return enveloppe_async

        @functools.wraps(fonction)
        def enveloppe(*args: Any, **kwargs: Any) -> Any:
            p, l = contexte(args, kwargs)
            with chrono(etape, p, l):
                return fonction(*args, **kwargs)
        return enveloppe

    return poser
