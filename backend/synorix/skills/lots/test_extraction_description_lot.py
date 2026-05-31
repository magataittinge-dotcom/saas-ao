"""Tests for skill #8 extraction-description-lot."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.lots.extraction_description_lot import (
    ExtractionDescriptionLot,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_extracts_description():
    fake_response = {
        "description": "Le lot porte sur la réfection de l'étanchéité des toitures-terrasses.",
        "prestations_principales": ["Fourniture et pose d'un complexe bicouche"],
        "prestations_accessoires": ["Dépose de l'ancien revêtement"],
        "montant_estime": None,
        "source_document": "CCTP Lot 5",
        "not_found": False,
        "confidence": 0.9,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExtractionDescriptionLot()
    output = await skill.run(
        Input(
            project_id=1,
            intitule_lot="Lot 5 — Étanchéité",
            cctp_text="Article 1 — Objet : réfection étanchéité toitures-terrasses…",
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.description
    assert output.prestations_principales
    assert output.montant_estime is None


def test_metadata():
    assert ExtractionDescriptionLot.name == "extraction-description-lot"
    assert ExtractionDescriptionLot.category == "lots"
    assert ExtractionDescriptionLot.model == "claude-sonnet-4-6"
    assert ExtractionDescriptionLot.notebook_sources == ["N4"]
    assert ExtractionDescriptionLot.pipeline_step == 2
