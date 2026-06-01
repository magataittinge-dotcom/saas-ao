"""Tests for skill #95 calculateur-OAB-temps-reel (deterministic, no LLM)."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.verification.calculateur_oab_temps_reel import (
    CalculateurOabTempsReel,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_oab_double_moyenne():
    """M1 excludes >1.2*M1, M2 recomputed, low candidate flagged OAB; no LLM call."""
    client_mock = AsyncMock()
    skill = CalculateurOabTempsReel()
    # offres: 100, 105, 110, 300(aberrante haute), candidat 70
    output = await skill.run(
        Input(project_id=1, prix_candidat=70.0, prix_offres=[70, 100, 105, 110, 300]),
        client=client_mock,
    )

    assert isinstance(output, Output)
    client_mock.complete.assert_not_called()
    # M1 = (70+100+105+110+300)/5 = 137; 1.2*M1=164.4 -> 300 exclue
    assert output.m1 == 137.0
    # M2 = (70+100+105+110)/4 = 96.25 ; seuil = 0.9*96.25 = 86.625
    assert output.m2 == 96.25
    assert output.seuil_oab_euros == 86.62 or output.seuil_oab_euros == 86.63
    assert output.est_oab is True
    assert output.gauge == "rouge"
    assert "Verchéenne" in output.rappel_juridique


@pytest.mark.asyncio
async def test_oab_safe_offer_vert():
    client_mock = AsyncMock()
    skill = CalculateurOabTempsReel()
    output = await skill.run(
        Input(project_id=1, prix_candidat=105.0, prix_offres=[100, 105, 110]),
        client=client_mock,
    )
    assert output.est_oab is False
    assert output.gauge == "vert"


def test_oab_metadata():
    assert CalculateurOabTempsReel.name == "calculateur-OAB-temps-reel"
    assert CalculateurOabTempsReel.category == "verification"
    assert CalculateurOabTempsReel.model == "none"
    assert CalculateurOabTempsReel.notebook_sources == ["N7"]
    assert CalculateurOabTempsReel.pipeline_step == 5
    assert CalculateurOabTempsReel.differentiateur == 7
