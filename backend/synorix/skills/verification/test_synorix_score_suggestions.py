"""Tests for skill #71 synorix-score-suggestions."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.verification.synorix_score_suggestions import (
    SynorixScoreSuggestions,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_score_suggestions_structure():
    fake = {
        "suggestions_par_axe": [
            {"axe": "Environnement", "note_sur_5": 2.0,
             "suggestions": ["Détailler poussières et boues sur voirie + moyens concrets"]},
        ],
        "ton": "positif",
        "sources_nbk": ["N7"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = SynorixScoreSuggestions()
    output = await skill.run(
        Input(project_id=1, axes_notes=[{"nom": "Environnement", "note_sur_5": 2.0}], seuil_sur_5=4.0),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.suggestions_par_axe
    assert all(s.suggestions for s in output.suggestions_par_axe)


def test_score_suggestions_metadata():
    assert SynorixScoreSuggestions.name == "synorix-score-suggestions"
    assert SynorixScoreSuggestions.category == "verification"
    assert SynorixScoreSuggestions.model == "claude-opus-4-7"
    assert SynorixScoreSuggestions.differentiateur == 4
