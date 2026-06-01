"""Tests for skill #88 conseil-recours-eviction."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.export.conseil_recours_eviction import (
    ConseilRecoursEviction,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_recours_eviction_structure():
    fake = {
        "recours_recommande": {
            "type": "refere-precontractuel",
            "fondement": "L551-1 CJA",
            "delai": "avant signature du contrat",
            "juridiction": "TA du lieu d'exécution",
            "condition": "marché non encore signé ; notifier l'acheteur",
        },
        "alternatives": [
            {"type": "refere-contractuel", "fondement": "L551-13 CJA", "delai": "31 jours"},
        ],
        "avertissement": "Orientation — consulter un avocat pour la requête.",
        "sources_nbk": ["N6"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = ConseilRecoursEviction()
    output = await skill.run(
        Input(project_id=1, marche_signe=False, motif_eviction="offre mieux-disante"),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert "L551-1" in output.recours_recommande.fondement
    assert output.avertissement


def test_recours_eviction_metadata():
    assert ConseilRecoursEviction.name == "conseil-recours-eviction"
    assert ConseilRecoursEviction.category == "export"
    assert ConseilRecoursEviction.model == "claude-sonnet-4-6"
    assert ConseilRecoursEviction.differentiateur == 11
