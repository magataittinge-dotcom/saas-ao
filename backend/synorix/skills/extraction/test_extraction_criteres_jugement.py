"""Tests for skill #13 extraction-criteres-jugement."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.extraction_criteres_jugement import (
    ExtractionCriteresJugement,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_extracts_weighted_criteria():
    fake_response = {
        "criteres": [
            {"critere": "Prix", "ponderation": "40%", "sous_criteres": []},
            {"critere": "Valeur technique", "ponderation": "50%", "sous_criteres": [
                {"nom": "Méthodologie", "ponderation": "20%"}
            ]},
            {"critere": "Délai", "ponderation": "10%", "sous_criteres": []},
        ],
        "formule_prix": "Inversement proportionnelle : Note = (prix le plus bas / prix offre) × 40",
        "ponderations_explicites": True,
        "source_page": 9,
        "not_found": False,
        "confidence": 0.95,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExtractionCriteresJugement()
    output = await skill.run(
        Input(project_id=1, rc_text="Prix 40%, Valeur technique 50%, Délai 10%."),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.criteres) == 3
    assert output.criteres[0].ponderation == "40%"
    assert output.formule_prix is not None


def test_metadata():
    assert ExtractionCriteresJugement.name == "extraction-criteres-jugement"
    assert ExtractionCriteresJugement.category == "extraction"
    assert ExtractionCriteresJugement.model == "claude-sonnet-4-6"
    assert ExtractionCriteresJugement.notebook_sources == ["N7"]
    assert ExtractionCriteresJugement.pipeline_step == 3
