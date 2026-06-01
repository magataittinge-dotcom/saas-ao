"""Tests for skill #80 analyse-historique-ao-entreprise."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.sidebar.analyse_historique_ao_entreprise import (
    AnalyseHistoriqueAoEntreprise,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_historique_ao_structure():
    fake = {
        "indicateurs": [
            {"libelle": "Taux de réussite global", "valeur": "38%"},
            {"libelle": "Métier le plus gagnant", "valeur": "ITE (62%)"},
        ],
        "insights_actionnables": [
            "Vous gagnez 2x plus sur les marchés scolaires < 1 M€ → cibler ce segment",
        ],
        "axes_a_renforcer": ["Environnement (souvent noté 2/5)"],
        "sources_nbk": [],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = AnalyseHistoriqueAoEntreprise()
    output = await skill.run(
        Input(project_id=1, historique_ao=[{"intitule": "École", "resultat": "gagne"}]),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.indicateurs
    assert output.insights_actionnables


def test_historique_ao_metadata():
    assert AnalyseHistoriqueAoEntreprise.name == "analyse-historique-ao-entreprise"
    assert AnalyseHistoriqueAoEntreprise.category == "sidebar"
    assert AnalyseHistoriqueAoEntreprise.model == "claude-sonnet-4-6"
    assert AnalyseHistoriqueAoEntreprise.pipeline_step == "sidebar"
