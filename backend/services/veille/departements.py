"""Départements français : liste officielle utilisée par la veille (contrat d'API).

Métropole 01-95 (la Corse est 2A / 2B, le code 20 n'existe plus) et outre-mer 971-976
(source : code officiel géographique de l'INSEE). Les collectivités d'outre-mer (977, 978, 98x)
et « 99 » (étranger) ne sont pas servies.
"""
from __future__ import annotations

DEPARTEMENTS: tuple[str, ...] = (
    tuple(f"{n:02d}" for n in range(1, 96) if n != 20) + ("2A", "2B") + tuple(str(n) for n in range(971, 977))
)
_ENSEMBLE = frozenset(DEPARTEMENTS)


def departement_valide(code) -> bool:
    return isinstance(code, str) and code in _ENSEMBLE


def normaliser_departement(code) -> str | None:
    """Code BOAMP → code officiel, ou None. Le BOAMP écrit « 6 » pour 06 et « 20A »/« 20B » pour 2A/2B."""
    if code is None:
        return None
    texte = str(code).strip().upper()
    if texte in ("20A", "20B"):
        texte = "2" + texte[-1]
    elif texte.isdigit() and len(texte) < 2:
        texte = texte.zfill(2)
    return texte if texte in _ENSEMBLE else None
