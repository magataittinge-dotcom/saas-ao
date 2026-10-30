#!/usr/bin/env python3
"""Tableau des durées par étape, tiré des lignes ``chrono`` du journal (services/chrono.py).

    python3 backend/scripts/chrono_tableau.py journal.txt
    sudo journalctl -u synorix-api --since "-1day" --no-pager | python3 backend/scripts/chrono_tableau.py
    python3 backend/scripts/chrono_tableau.py journal.txt --projet <id>    # un seul AO

Une ligne lue : ``chrono etape=analyse projet=<id> lot=<id> duree_ms=12345 statut=ok`` (le préfixe du journal avant
« chrono » est ignoré, toute autre ligne aussi). Par étape : ``nombre`` (étapes terminées en ``ok``), ``mediane``,
``p90`` (rang le plus proche) et ``max`` en millisecondes sur ces étapes, puis ``erreurs`` (statuts autres que ``ok``,
exclus des durées). Aucune donnée n'est écrite ni envoyée : lecture seule, bibliothèque standard seulement.
"""
from __future__ import annotations

import argparse
import math
import re
import statistics
import sys
from collections import defaultdict
from typing import Iterable, TextIO

LIGNE = re.compile(
    r"\bchrono etape=(?P<etape>[A-Za-z0-9_.+-]+) projet=(?P<projet>[A-Za-z0-9_.+-]+) lot=(?P<lot>[A-Za-z0-9_.+-]+) "
    r"duree_ms=(?P<duree>\d+) statut=(?P<statut>[A-Za-z]+)\s*$"
)
ORDRE = ("depot", "lecture", "lots", "analyse", "analyse_lot", "memoire", "export")


def lire(lignes: Iterable[str], projet: str | None = None) -> tuple[dict[str, list[int]], dict[str, int]]:
    """(durées en ms des étapes ``ok`` par étape, nombre d'étapes en erreur par étape)."""
    durees: dict[str, list[int]] = defaultdict(list)
    erreurs: dict[str, int] = defaultdict(int)
    for texte in lignes:
        m = LIGNE.search(texte)
        if not m or (projet and m["projet"] != projet):
            continue
        if m["statut"] == "ok":
            durees[m["etape"]].append(int(m["duree"]))
        else:
            erreurs[m["etape"]] += 1
            durees.setdefault(m["etape"], [])
    return durees, erreurs


def p90(valeurs: list[int]) -> int:
    triees = sorted(valeurs)
    return triees[max(0, math.ceil(0.9 * len(triees)) - 1)]


def tableau(durees: dict[str, list[int]], erreurs: dict[str, int]) -> str:
    etapes = sorted(durees, key=lambda e: (ORDRE.index(e) if e in ORDRE else len(ORDRE), e))
    if not etapes:
        return "Aucune ligne « chrono » trouvée."
    entetes = ("etape", "nombre", "mediane_ms", "p90_ms", "max_ms", "erreurs")
    rangs = []
    for e in etapes:
        v = durees[e]
        stats = (str(round(statistics.median(v))), str(p90(v)), str(max(v))) if v else ("-", "-", "-")
        rangs.append((e, str(len(v)), *stats, str(erreurs.get(e, 0))))
    largeurs = [max(len(entetes[i]), *(len(r[i]) for r in rangs)) for i in range(len(entetes))]

    def fmt(r: tuple[str, ...]) -> str:
        return "  ".join(c.ljust(largeurs[0]) if i == 0 else c.rjust(largeurs[i]) for i, c in enumerate(r))

    return "\n".join([fmt(entetes), "  ".join("-" * w for w in largeurs), *(fmt(r) for r in rangs)])


def main(argv: list[str] | None = None, entree: TextIO | None = None, sortie: TextIO | None = None) -> int:
    ap = argparse.ArgumentParser(description="Tableau des durées par étape (lignes « chrono » du journal).")
    ap.add_argument("journal", nargs="?", help="fichier de journal ; sans argument ou « - » : l'entrée standard")
    ap.add_argument("--projet", help="ne garder que les lignes de ce projet")
    args = ap.parse_args(argv)
    sortie = sortie or sys.stdout
    if args.journal and args.journal != "-":
        with open(args.journal, encoding="utf-8", errors="replace") as f:
            durees, erreurs = lire(f, args.projet)
    else:
        durees, erreurs = lire(entree or sys.stdin, args.projet)
    print(tableau(durees, erreurs), file=sortie)
    return 0


if __name__ == "__main__":
    sys.exit(main())
