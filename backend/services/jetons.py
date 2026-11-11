"""Une ligne de journal par appel au modèle : les jetons facturés, sans aucun texte.

    jetons etape=<étiquette> modele=<id> entree=<n> cache_lecture=<n> cache_ecriture=<n> sortie=<n>

Lue par ``scripts/couts_journal.py`` pour le coût réel d'une analyse ou d'un mémoire (recette du 2/11). Aucune donnée
du DCE ni donnée personnelle : seulement l'étiquette technique de l'étape (nettoyée) et des nombres.
"""
from __future__ import annotations

import contextvars
import re
from contextlib import contextmanager
from typing import Iterator

_NON_SUR = re.compile(r"[^A-Za-z0-9_.+-]+")


def _n(usage: object, nom: str) -> int:
    if usage is None:
        return 0
    valeur = usage.get(nom, 0) if isinstance(usage, dict) else getattr(usage, nom, 0)
    try:
        return int(valeur or 0)
    except (TypeError, ValueError):
        return 0


# S-01 (filet du budget d'IA) — collecte des jetons d'un travail (analyse, mémoire) pour les inscrire dans `couts_ia`
# à la fin. La liste est portée par une variable de contexte : `asyncio.run` et `asyncio.to_thread` la transmettent ;
# un `ThreadPoolExecutor` non (ses tâches passent par `transmettre`).
_COLLECTE: contextvars.ContextVar = contextvars.ContextVar("synorix_collecte_jetons", default=None)


@contextmanager
def collecter() -> Iterator[list]:
    """Pendant le bloc, chaque `ligne_jetons` ajoute (modele, usage en dict) à la liste rendue."""
    lignes: list = []
    jeton = _COLLECTE.set(lignes)
    try:
        yield lignes
    finally:
        _COLLECTE.reset(jeton)


def transmettre(fonction):
    """`fonction` exécutée dans une copie du contexte courant (pour `pool.submit`) : la collecte suit le fil.
    Une copie par envoi : `pool.submit(transmettre(f), …)` à chaque fois (une copie ne s'ouvre pas dans deux fils)."""
    contexte = contextvars.copy_context()
    return lambda *a, **kw: contexte.run(fonction, *a, **kw)


def ligne_jetons(etape: str, modele: str, usage: object) -> str:
    collecte = _COLLECTE.get()
    if collecte is not None:
        collecte.append((str(modele or "inconnu"), {nom: _n(usage, nom) for nom in (
            "input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")}))
    etiquette = _NON_SUR.sub("_", str(etape or "appel")).strip("_")[:60] or "appel"
    return (
        f"jetons etape={etiquette} modele={_NON_SUR.sub('_', str(modele or 'inconnu'))} "
        f"entree={_n(usage, 'input_tokens')} cache_lecture={_n(usage, 'cache_read_input_tokens')} "
        f"cache_ecriture={_n(usage, 'cache_creation_input_tokens')} sortie={_n(usage, 'output_tokens')}"
    )
