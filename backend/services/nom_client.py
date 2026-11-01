"""Nom d'un client affiché hors de l'appli (fiches, mémoire) : un particulier n'apparaît que par ses initiales,
sauf si l'entreprise a coché « afficher le nom complet » (RGPD, migration 0031). Les clients publics et
professionnels gardent leur nom."""
from __future__ import annotations

import re
from typing import Optional

# Civilités conservées telles quelles devant les initiales.
_CIVILITES = {"m", "m.", "mr", "mme", "mlle", "mle", "monsieur", "madame", "mademoiselle", "dr", "me", "pr"}


def initiales(nom: str) -> str:
    """« Mme Dubois » → « Mme D. », « Jean-Pierre Martin » → « J.-P. M. » : chaque mot hors civilité devient son
    initiale suivie d'un point ; les civilités et les traits d'union sont gardés."""
    morceaux = []
    for mot in nom.split():
        if mot.lower() in _CIVILITES:
            morceaux.append(mot)
            continue
        parties = [p for p in re.split(r"(-)", mot) if p]
        morceaux.append("".join(p if p == "-" else (p[0].upper() + ".") for p in parties if p == "-" or p[0].isalnum()))
    return " ".join(m for m in morceaux if m)


def nom_client_affiche(maitre_ouvrage: Optional[str], client_type: Optional[str], nom_complet: Optional[bool]) -> str:
    """Le nom à écrire : initiales pour un particulier sans accord, le nom tel que saisi sinon."""
    nom = (maitre_ouvrage or "").strip()
    if not nom:
        return ""
    if client_type == "particulier" and not nom_complet:
        return initiales(nom)
    return nom
