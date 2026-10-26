"""Tableau des références : tableau Word natif (retouchable par le patron), données saisies.

Un tableau natif est plus juste qu'un dessin : il se lit, se copie et se corrige dans Word,
et l'en-tête se répète d'une page à l'autre. Les colonnes sans aucune donnée disparaissent ;
sans référence, le bloc disparaît.
"""
from __future__ import annotations

from .modele import Visuel
from .texte import nettoyer


def _montant(valeur) -> str:
    try:
        v = float(valeur)
    except (TypeError, ValueError):
        return ""
    if v <= 0:
        return ""
    return f"{round(v):,}".replace(",", " ") + " € HT"


def tableau_references(references, couleur: str) -> dict | None:
    """{entetes, lignes, largeurs_cm, couleur} pour les références données, ou None."""
    refs = [r for r in references or [] if (getattr(r, "intitule", None) or "").strip()]
    if not refs:
        return None
    refs = sorted(refs, key=lambda r: -(getattr(r, "annee", None) or 0))
    colonnes = [
        ("Opération", [(nettoyer(r.intitule).strip() + (f"\n{nettoyer(r.lot).strip()}" if getattr(r, "lot", None) else ""))
                       for r in refs], 6.0),
        ("Lieu", [nettoyer(getattr(r, "adresse", None) or "").strip() for r in refs], 3.3),
        ("Maître d'ouvrage", [nettoyer(getattr(r, "maitre_ouvrage", None) or "").strip() for r in refs], 3.7),
        ("Année", [str(r.annee) if getattr(r, "annee", None) else "" for r in refs], 1.5),
        ("Montant", [_montant(getattr(r, "montant_ht", None)) for r in refs], 2.5),
    ]
    colonnes = [c for i, c in enumerate(colonnes) if i == 0 or any(c[1])]
    total = sum(c[2] for c in colonnes)
    largeurs = [round(c[2] * 17.0 / total, 2) for c in colonnes]
    lignes = [[c[1][i] for c in colonnes] for i in range(len(refs))]
    return {"entetes": [c[0] for c in colonnes], "lignes": lignes, "largeurs_cm": largeurs, "couleur": couleur}


def construire(references, couleur: str) -> Visuel | None:
    tab = tableau_references(references, couleur)
    if not tab:
        return None
    alt = "Références de l'entreprise : " + " ; ".join(l[0].replace("\n", " — ") for l in tab["lignes"]) + "."
    return Visuel(("partie_a", "references"), "", alt, "Références de l'entreprise — d'après vos références saisies",
                  17.0, tableau=tab, gabarits=("tableau_markdown",))
