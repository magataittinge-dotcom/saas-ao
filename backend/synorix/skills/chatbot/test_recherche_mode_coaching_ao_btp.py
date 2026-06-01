"""Tests for skill #82 recherche-mode-coaching-ao-btp."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.chatbot.recherche_mode_coaching_ao_btp import (
    RechercheModeCoachingAoBtp,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_mode_coaching_structure():
    fake = {
        "patterns": [
            {"persona": "debutant", "ton": "encourageant, pédagogique", "exemples_intervention": ["expliquer un piège DCE"]},
            {"persona": "expert", "ton": "factuel, challengeant", "exemples_intervention": ["questionner le montage GME"]},
        ],
        "moments_intervention": ["analyse DCE", "mémoire", "dépôt"],
        "regles_longueur_format": ["ultra-concis (2 min)", "puces et gras", "orienté livrable"],
        "sources_nbk": ["N8"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RechercheModeCoachingAoBtp()
    output = await skill.run(Input(project_id=1), client=client_mock)

    assert isinstance(output, Output)
    personas = {p.persona for p in output.patterns}
    assert "debutant" in personas and "expert" in personas


def test_mode_coaching_metadata():
    assert RechercheModeCoachingAoBtp.name == "recherche-mode-coaching-ao-btp"
    assert RechercheModeCoachingAoBtp.category == "chatbot"
    assert RechercheModeCoachingAoBtp.model == "claude-sonnet-4-6"
    assert RechercheModeCoachingAoBtp.notebook_sources == ["N8"]
