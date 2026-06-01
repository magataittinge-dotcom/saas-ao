"""Tests for skill #89 cotraitance-groupement."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.chatbot.cotraitance_groupement import (
    CotraitanceGroupement,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_cotraitance_structure():
    fake = {
        "gme_pertinent": True,
        "raison_detection": "Montant du lot > 0,6 × CA → capacité dépassée seul",
        "regime_recommande": "conjoint-mandataire-solidaire",
        "explication_regimes": "R2142-20 : conjoint = sur son lot ; solidaire = totalité du marché",
        "formulaires": [
            {"nom": "DC1", "role": "cadre du groupement + désignation mandataire"},
            {"nom": "DC2", "role": "rempli par chaque membre"},
        ],
        "avertissement_dc4": "Le DC4 ne concerne pas la cotraitance (sous-traitance uniquement).",
        "sources_nbk": ["N8"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = CotraitanceGroupement()
    output = await skill.run(
        Input(project_id=1, montant_lot=800000.0, ca_derniere_annee=1000000.0),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert "R2142-20" in output.explication_regimes
    assert "DC4" in output.avertissement_dc4
    noms = [f.nom for f in output.formulaires]
    assert "DC1" in noms and "DC2" in noms


def test_cotraitance_metadata():
    assert CotraitanceGroupement.name == "cotraitance-groupement"
    assert CotraitanceGroupement.category == "chatbot"
    assert CotraitanceGroupement.model == "claude-sonnet-4-6"
    assert CotraitanceGroupement.differentiateur == 12
