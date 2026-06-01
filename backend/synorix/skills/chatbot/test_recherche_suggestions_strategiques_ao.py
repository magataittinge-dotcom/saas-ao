"""Tests for skill #83 recherche-suggestions-strategiques-ao."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.chatbot.recherche_suggestions_strategiques_ao import (
    RechercheSuggestionsStrategiquesAo,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_suggestions_strategiques_structure():
    fake = {
        "suggestions": [
            {"levier": "plus-values", "suggestion": "70% isolants fibre de bois à <20km, −X t CO2",
             "benefice": "+ note RSE (5-25%)"},
            {"levier": "prix", "suggestion": "Prix unitaire spécifique échafaudage si retard d'autres lots",
             "benefice": "protection marge"},
        ],
        "sources_nbk": ["N8"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RechercheSuggestionsStrategiquesAo()
    output = await skill.run(
        Input(project_id=1, contexte_ao={"lot": "ITE"}, profil_entreprise={}),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.suggestions
    assert all(s.benefice for s in output.suggestions)


def test_suggestions_strategiques_metadata():
    assert RechercheSuggestionsStrategiquesAo.name == "recherche-suggestions-strategiques-ao"
    assert RechercheSuggestionsStrategiquesAo.category == "chatbot"
    assert RechercheSuggestionsStrategiquesAo.model == "claude-opus-4-7"
    assert RechercheSuggestionsStrategiquesAo.differentiateur == 14
