"""Tests for skill #24 calculatrice-retenue-garantie (déterministe)."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.calculatrice_retenue_garantie import (
    CalculatriceRetenueGarantie,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_computes_rg_and_caution_on_ttc():
    """RG = TTC × 5 % ; calcul déterministe (le client n'est jamais appelé)."""
    client_mock = AsyncMock()  # ne doit pas être utilisé

    skill = CalculatriceRetenueGarantie()
    output = await skill.run(
        Input(project_id=1, montant_ht=100000.0, tva=0.20, taux_rg=0.05),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.montant_ttc == 120000.0
    rg = next(p for p in output.postes if p.poste == "Retenue de garantie")
    assert rg.montant == 6000.0  # 120000 × 5%
    assert rg.base == "TTC"
    client_mock.complete.assert_not_called()


@pytest.mark.asyncio
async def test_penalites_plafonnees_et_seuil():
    client_mock = AsyncMock()
    skill = CalculatriceRetenueGarantie()
    output = await skill.run(
        Input(
            project_id=1,
            montant_ht=100000.0,
            jours_retard_execution=500,
            penalite_diviseur=1000,
        ),
        client=client_mock,
    )
    pen = next(p for p in output.postes if p.poste == "Pénalités de retard")
    # 100000 × 500 / 1000 = 50000 > plafond 10% HT = 10000 → plafonné
    assert pen.montant == 10000.0
    assert any("plafonn" in a.lower() for a in output.avertissements)


@pytest.mark.asyncio
async def test_taux_rg_plafonne():
    client_mock = AsyncMock()
    skill = CalculatriceRetenueGarantie()
    output = await skill.run(
        Input(project_id=1, montant_ht=100000.0, taux_rg=0.10),
        client=client_mock,
    )
    rg = next(p for p in output.postes if p.poste == "Retenue de garantie")
    assert rg.montant == 6000.0  # plafonné à 5% → 120000 × 5%
    assert any("plafonné à 5" in a for a in output.avertissements)


def test_metadata():
    assert CalculatriceRetenueGarantie.name == "calculatrice-retenue-garantie"
    assert CalculatriceRetenueGarantie.category == "extraction"
    assert CalculatriceRetenueGarantie.model == "none"
    assert CalculatriceRetenueGarantie.pipeline_step == 3
