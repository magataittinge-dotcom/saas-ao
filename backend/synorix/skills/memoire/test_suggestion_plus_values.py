"""Tests for skill #61 suggestion-plus-values."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.suggestion_plus_values import (
    SuggestionPlusValues,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_suggestion_plus_values_structure():
    fake_response = {
        "plus_values": [
            {
                "intitule": "Mise en eau avant réception",
                "benefice_client": "Preuve d'absence de fuites sur points singuliers",
                "cout_estime": "faible",
                "impact_note": "+ valeur technique",
                "corps_de_metier": "Étanchéité",
            },
            {
                "intitule": "Nettoyage pièce par pièce (site occupé)",
                "benefice_client": "Confort des usagers maintenus sur site",
                "cout_estime": "nul",
                "impact_note": "+ compréhension du besoin",
                "corps_de_metier": "Menuiserie",
            },
        ],
        "gadgets_ecartes": ["App mobile sans bénéfice mesurable"],
        "champs_a_completer": [],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = SuggestionPlusValues()
    output = await skill.run(
        Input(project_id=1, corps_de_metier="Étanchéité", contexte_chantier="site occupé"),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.plus_values) >= 2
    assert output.sources_nbk == ["N3"]


def test_suggestion_plus_values_metadata():
    assert SuggestionPlusValues.name == "suggestion-plus-values"
    assert SuggestionPlusValues.category == "memoire"
    assert SuggestionPlusValues.model == "claude-sonnet-4-6"
    assert SuggestionPlusValues.notebook_sources == ["N3"]
    assert SuggestionPlusValues.pipeline_step == 4
