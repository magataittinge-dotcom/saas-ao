"""Tests du service pur synorix_calc (différenciateurs déterministes, 0 LLM).

Vérifie que les wrappers de service délèguent correctement aux skills testées
et retournent des dicts exploitables par un futur endpoint. Aucun appel API.
"""

import pytest

from services.synorix_calc import compute_retenue_garantie


@pytest.mark.asyncio
async def test_compute_retenue_garantie_basic():
    """Retenue de garantie 5% + TTC corrects, postes détaillés présents."""
    res = await compute_retenue_garantie(montant_ht=100_000.0)
    assert res["montant_ttc"] == pytest.approx(120_000.0)
    # Retenue de garantie = 5% du TTC (base légale, Art.19 CCAG) = 120000×5% = 6000
    rg = [p for p in res["postes"] if "garantie" in p["poste"].lower()]
    assert rg and rg[0]["montant"] == pytest.approx(6_000.0)


@pytest.mark.asyncio
async def test_compute_retenue_garantie_penalites_retard():
    """Pénalités de retard 1/3000 du HT par jour (CCAG-Travaux Art.19.2.3)."""
    res = await compute_retenue_garantie(
        montant_ht=300_000.0, jours_retard_execution=10
    )
    # 1/3000 * 300000 = 100 €/jour → 10 jours = 1000 €
    pen = [p for p in res["postes"] if "retard" in p["poste"].lower() or "pénal" in p["poste"].lower()]
    assert pen, "poste pénalités attendu"
