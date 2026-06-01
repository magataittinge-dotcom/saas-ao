"""Tests for skill #38 recuperation-bibliotheque-memoire."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.recuperation_bibliotheque_memoire import (
    RecuperationBibliothequeMemoire,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_recuperation_bibliotheque_structure():
    """Returns candidate blocks ranked by pertinence, excluding incompatible
    corps-de-métier blocks."""
    fake_response = {
        "phrases_candidates": [
            {
                "bloc_id": "B1",
                "extrait": "Procédure de pose ITE en site occupé...",
                "score_pertinence": 90,
                "section": "methodologie",
                "corps_de_metier": "ITE",
            },
            {
                "bloc_id": "B2",
                "extrait": "Calage-chevillage des panneaux...",
                "score_pertinence": 75,
                "section": "methodologie",
                "corps_de_metier": "ITE",
            },
        ],
        "incoherences_exclues": ["B9 exclu : corps de métier 'Électricité' incompatible"],
        "granularite_recommandee": "paragraphe-thematique",
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = RecuperationBibliothequeMemoire()
    output = await skill.run(
        Input(
            project_id=1,
            user_id=7,
            section_cible="methodologie",
            corps_de_metier="ITE",
            contexte_ao="école, site occupé",
            bibliotheque=[{"bloc_id": "B1"}, {"bloc_id": "B9"}],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    scores = [p.score_pertinence for p in output.phrases_candidates]
    assert scores == sorted(scores, reverse=True)
    # Aucun bloc remonté avec un métier incompatible
    assert all(p.corps_de_metier == "ITE" for p in output.phrases_candidates)
    assert output.incoherences_exclues


def test_recuperation_bibliotheque_metadata():
    assert RecuperationBibliothequeMemoire.name == "recuperation-bibliotheque-memoire"
    assert RecuperationBibliothequeMemoire.category == "memoire"
    assert RecuperationBibliothequeMemoire.model == "claude-haiku-4-5"
    assert RecuperationBibliothequeMemoire.notebook_sources == ["N3"]
    assert RecuperationBibliothequeMemoire.pipeline_step == 4
