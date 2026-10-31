"""Comptes par département et filtres de la veille (cache 15 min, invalidé à la synchronisation)."""
from __future__ import annotations

from services.cache import org_cache

PREFIXE_CACHE = "veille:"


def invalider_cache() -> int:
    """Vide les comptes en cache (appelé à chaque synchronisation)."""
    return org_cache.invalidate(PREFIXE_CACHE)
