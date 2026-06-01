"""Tests for skill #86 RAO-predictif."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.verification.rao_predictif import RaoPredictif, Input, Output


@pytest.mark.asyncio
async def test_rao_predictif_structure():
    fake = {
        "rao": {
            "sous_criteres": [
                {"nom": "Méthodologie", "note_sur_5": 4.0, "ponderation_pct": 30,
                 "justification": "Phases détaillées", "ecart_critique": ""},
                {"nom": "Prix", "note_sur_5": 5.0, "ponderation_pct": 40,
                 "justification": "Plus bas", "ecart_critique": ""},
            ],
            "note_ponderee_globale": 88.0,
            "classement_probable": "probable 1er/4",
        },
        "cadre_juridique": "R2152-6 à R2152-8 CCP",
        "sources_nbk": ["N7"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RaoPredictif()
    output = await skill.run(
        Input(project_id=1, memoire_text="...", criteres_ponderes=[{"nom": "Méthodologie", "pct": 30}]),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert all(0 <= s.note_sur_5 <= 5 for s in output.rao.sous_criteres)
    assert "R2152" in output.cadre_juridique


def test_rao_predictif_metadata():
    assert RaoPredictif.name == "RAO-predictif"
    assert RaoPredictif.category == "verification"
    assert RaoPredictif.model == "claude-sonnet-4-6"
    assert RaoPredictif.differentiateur == 8
