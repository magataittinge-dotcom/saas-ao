"""Tests for skill #70 synorix-score-evaluateur."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.verification.synorix_score_evaluateur import (
    SynorixScoreEvaluateur,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_score_evaluateur_structure():
    fake = {
        "score_global": 78.0,
        "axes": [
            {"nom": "Méthodologie", "note_sur_5": 4.0, "ponderation_pct": 30, "justification": "Phases détaillées..."},
            {"nom": "Sécurité", "note_sur_5": 3.5, "ponderation_pct": 20, "justification": "Co-activité traitée..."},
        ],
        "ponderations_explicites": False,
        "sources_nbk": ["N7"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = SynorixScoreEvaluateur()
    output = await skill.run(
        Input(project_id=1, memoire_text="...", ponderations={"Méthodologie": 30}),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert 0 <= output.score_global <= 100
    assert all(a.justification for a in output.axes)


def test_score_evaluateur_metadata():
    assert SynorixScoreEvaluateur.name == "synorix-score-evaluateur"
    assert SynorixScoreEvaluateur.category == "verification"
    assert SynorixScoreEvaluateur.model == "claude-opus-4-7"
    assert SynorixScoreEvaluateur.notebook_sources == ["N7"]
    assert SynorixScoreEvaluateur.differentiateur == 5
