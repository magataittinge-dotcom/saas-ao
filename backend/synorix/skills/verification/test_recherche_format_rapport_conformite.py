"""Tests for skill #64 recherche-format-rapport-conformite."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.verification.recherche_format_rapport_conformite import (
    RechercheFormatRapportConformite,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_format_rapport_structure():
    fake = {
        "rapport": {
            "sections": [
                {"titre": "Pièces obligatoires", "ordre": 1, "criticite_max": "bloquant",
                 "items": [{"libelle": "DC1", "statut": "a_ajouter", "criticite": "bloquant"}]},
                {"titre": "Validité", "ordre": 2, "criticite_max": "recommande", "items": []},
                {"titre": "Conformité de forme", "ordre": 3, "criticite_max": "recommande", "items": []},
                {"titre": "Synorix Score", "ordre": 4, "criticite_max": "conforme", "items": []},
            ],
            "ton": "positif-actionnable",
            "recapitulatif_actions": ["Ajouter le DC1"],
        },
        "sources_nbk": ["N6"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RechercheFormatRapportConformite()
    output = await skill.run(Input(project_id=1), client=client_mock)

    assert isinstance(output, Output)
    assert len(output.rapport.sections) >= 4
    assert output.rapport.ton == "positif-actionnable"


def test_format_rapport_metadata():
    assert RechercheFormatRapportConformite.name == "recherche-format-rapport-conformite"
    assert RechercheFormatRapportConformite.category == "verification"
    assert RechercheFormatRapportConformite.model == "claude-sonnet-4-6"
    assert RechercheFormatRapportConformite.pipeline_step == 5
