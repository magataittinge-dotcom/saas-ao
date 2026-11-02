#!/usr/bin/env python3
"""Coût réel des appels au modèle, tiré des lignes ``jetons`` du journal (services/jetons.py).

    python3 backend/scripts/couts_journal.py api-locale.log
    python3 backend/scripts/couts_journal.py api-locale.log --depuis-ligne 1200   # seulement la fin du journal

Par modèle : nombre d'appels, jetons (entrée, lecture du cache, écriture du cache, sortie) et coût en dollars, puis le
total en dollars et en euros (taux INDICATIF ``--taux``, 0,92 par défaut ; le dollar est la donnée sûre).
Tarifs en dollars par million de jetons (entrée, sortie) ; lecture du cache à 10 % de l'entrée, écriture (5 min) à
125 %. Sonnet 4.6 : 3 / 15. Sonnet 5.5 : 2 / 10 (le tarif de la mesure du 26/10 : 0,974 $ pour le mémoire de Gueux).
Haiku 4.5 : 1 / 5. Un modèle sans tarif est compté en jetons et signalé, jamais deviné.
Lecture seule, bibliothèque standard seulement.
"""
from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from typing import Iterable

LIGNE = re.compile(
    r"\bjetons etape=(?P<etape>\S+) modele=(?P<modele>\S+) entree=(?P<e>\d+) cache_lecture=(?P<cl>\d+) "
    r"cache_ecriture=(?P<ce>\d+) sortie=(?P<s>\d+)\s*$"
)
TARIFS = {  # $ / million de jetons : entrée, sortie
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-haiku-4-5-20251001": (1.0, 5.0),
    "claude-haiku-4-5": (1.0, 5.0),
}


def cout_usd(modele: str, e: int, cl: int, ce: int, s: int) -> float | None:
    tarif = TARIFS.get(modele)
    if tarif is None:
        return None
    entree, sortie = tarif
    return (e * entree + cl * entree * 0.10 + ce * entree * 1.25 + s * sortie) / 1_000_000


def additionner(lignes: Iterable[str]) -> dict[str, dict[str, int]]:
    par_modele: dict[str, dict[str, int]] = defaultdict(lambda: {"appels": 0, "e": 0, "cl": 0, "ce": 0, "s": 0})
    for ligne in lignes:
        m = LIGNE.search(ligne.rstrip("\n"))
        if not m:
            continue
        t = par_modele[m["modele"]]
        t["appels"] += 1
        for cle in ("e", "cl", "ce", "s"):
            t[cle] += int(m[cle])
    return dict(par_modele)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Coût réel des appels au modèle, tiré des lignes « jetons » du journal.")
    p.add_argument("journal", nargs="?", help="fichier de journal (sinon l'entrée standard)")
    p.add_argument("--depuis-ligne", type=int, default=1, help="première ligne lue (1 = tout le journal)")
    p.add_argument("--taux", type=float, default=0.92, help="taux dollar -> euro, indicatif")
    a = p.parse_args(argv)
    flux = open(a.journal, encoding="utf-8", errors="replace") if a.journal else sys.stdin
    with flux:
        lignes = [l for i, l in enumerate(flux, start=1) if i >= a.depuis_ligne]
    total = 0.0
    inconnus = []
    for modele, t in sorted(additionner(lignes).items()):
        usd = cout_usd(modele, t["e"], t["cl"], t["ce"], t["s"])
        print(f"{modele} : {t['appels']} appels, entrée {t['e']}, lecture du cache {t['cl']}, "
              f"écriture du cache {t['ce']}, sortie {t['s']} -> "
              + (f"{usd:.3f} $" if usd is not None else "TARIF INCONNU"))
        if usd is None:
            inconnus.append(modele)
        else:
            total += usd
    print(f"TOTAL : {total:.3f} $ = {total * a.taux:.3f} € (taux indicatif {a.taux})")
    return 2 if inconnus else 0


if __name__ == "__main__":
    sys.exit(main())
