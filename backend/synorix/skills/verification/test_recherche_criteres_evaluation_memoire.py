"""Tests for skill #65 recherche-criteres-evaluation-memoire."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.verification.recherche_criteres_evaluation_memoire import (
    RechercheCriteresEvaluationMemoire,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_criteres_evaluation_structure():
    fake = {
        "axes": [
            {"nom": "Méthodologie", "ponderation_indicative_pct": 30, "sous_criteres": ["procédés"]},
            {"nom": "Moyens", "ponderation_indicative_pct": 20, "sous_criteres": ["humains", "matériels"]},
            {"nom": "Sécurité", "ponderation_indicative_pct": 15, "sous_criteres": ["site occupé"]},
            {"nom": "Environnement", "ponderation_indicative_pct": 15, "sous_criteres": ["SOGED"]},
            {"nom": "Prix", "ponderation_indicative_pct": 20, "sous_criteres": []},
        ],
        "echelle_notation": ["Très satisfaisant", "Satisfaisant", "Assez satisfaisant",
                              "Passable", "Insuffisant", "Absence d'information"],
        "ponderations_explicites": False,
        "sources_nbk": ["N7"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RechercheCriteresEvaluationMemoire()
    output = await skill.run(Input(project_id=1, type_marche="travaux"), client=client_mock)

    assert isinstance(output, Output)
    assert len(output.echelle_notation) == 6
    assert output.ponderations_explicites is False


def test_criteres_evaluation_metadata():
    assert RechercheCriteresEvaluationMemoire.name == "recherche-criteres-evaluation-memoire"
    assert RechercheCriteresEvaluationMemoire.category == "verification"
    assert RechercheCriteresEvaluationMemoire.model == "claude-sonnet-4-6"
    assert RechercheCriteresEvaluationMemoire.notebook_sources == ["N7"]
