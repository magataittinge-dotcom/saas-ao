"""Tests for skill #12 extraction-exigences-techniques."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.extraction_exigences_techniques import (
    ExtractionExigencesTechniques,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_extracts_typed_requirements():
    fake_response = {
        "exigences": [
            {
                "type": "norme",
                "libelle": "Maçonnerie conforme",
                "reference_norme": "NF DTU 20.1",
                "valeur_seuil": None,
                "page_source": 12,
            },
            {
                "type": "performance",
                "libelle": "Perméabilité couche poreuse",
                "reference_norme": None,
                "valeur_seuil": "≥ 10⁻³ m/s",
                "page_source": 18,
            },
        ],
        "confidence": 0.88,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExtractionExigencesTechniques()
    output = await skill.run(
        Input(project_id=1, cctp_text="Maçonnerie NF DTU 20.1 ; perméabilité ≥ 10⁻³ m/s."),
        client=client_mock,
    )

    assert isinstance(output, Output)
    types = {e.type for e in output.exigences}
    assert "norme" in types and "performance" in types
    assert output.exigences[0].reference_norme == "NF DTU 20.1"


def test_metadata():
    assert ExtractionExigencesTechniques.name == "extraction-exigences-techniques"
    assert ExtractionExigencesTechniques.category == "extraction"
    assert ExtractionExigencesTechniques.model == "claude-sonnet-4-6"
    assert ExtractionExigencesTechniques.notebook_sources == ["N4"]
    assert ExtractionExigencesTechniques.pipeline_step == 3
