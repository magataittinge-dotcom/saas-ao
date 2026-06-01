"""Tests for skill #92 criteres-RSE-2026."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.criteres_rse_2026 import CriteresRse2026, Input, Output


@pytest.mark.asyncio
async def test_criteres_rse_structure():
    fake = {
        "criteres_detectes": [
            {"categorie": "dechets", "citation_dce": "CCAP art. 12", "implicite": False},
            {"categorie": "insertion", "citation_dce": "RC art. 5 (clause sociale)", "implicite": False},
        ],
        "suggestions": [
            {"categorie": "dechets", "engagement": "Tri 5 flux + BSD", "indicateur_chiffre": "[À COMPLÉTER PAR L'ENTREPRISE]"},
            {"categorie": "insertion", "engagement": "Heures via Mission Locale", "indicateur_chiffre": "[À COMPLÉTER PAR L'ENTREPRISE]"},
        ],
        "section_rse_markdown": "## RSE\n...",
        "ecarts_step5": [{"categorie": "carbone", "severite": "🟡"}],
        "sources_nbk": ["N7", "N8"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = CriteresRse2026()
    output = await skill.run(
        Input(project_id=1, cctp_ccap_text="clause sociale 200h..."),
        client=client_mock,
    )

    assert isinstance(output, Output)
    # Aucun indicateur chiffré inventé
    assert all(s.indicateur_chiffre == "[À COMPLÉTER PAR L'ENTREPRISE]" for s in output.suggestions)
    assert output.sources_nbk == ["N7", "N8"]


def test_criteres_rse_metadata():
    assert CriteresRse2026.name == "criteres-RSE-2026"
    assert CriteresRse2026.category == "memoire"
    assert CriteresRse2026.model == "claude-sonnet-4-6"
    assert CriteresRse2026.notebook_sources == ["N7", "N8"]
    assert CriteresRse2026.differentiateur == 13
