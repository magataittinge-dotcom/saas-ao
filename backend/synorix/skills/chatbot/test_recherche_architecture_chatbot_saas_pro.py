"""Tests for skill #81 recherche-architecture-chatbot-saas-pro."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.chatbot.recherche_architecture_chatbot_saas_pro import (
    RechercheArchitectureChatbotSaasPro,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_architecture_chatbot():
    fake = {
        "surfaces": ["bulle flottante", "page dédiée"],
        "modes": ["contextuel", "plein écran"],
        "contexte": {"multi_projet": True, "memoire_long_terme": True, "streaming": True},
        "principes": ["bascule de contexte explicite entre AO"],
        "sources_nbk": [],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RechercheArchitectureChatbotSaasPro()
    output = await skill.run(Input(project_id=1), client=client_mock)

    assert isinstance(output, Output)
    assert len(output.surfaces) >= 2
    assert output.contexte.multi_projet is True


def test_architecture_chatbot_metadata():
    assert RechercheArchitectureChatbotSaasPro.name == "recherche-architecture-chatbot-saas-pro"
    assert RechercheArchitectureChatbotSaasPro.category == "chatbot"
    assert RechercheArchitectureChatbotSaasPro.model == "claude-sonnet-4-6"
