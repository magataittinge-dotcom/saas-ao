"""Tests for skill #10 extraction-exigences-administratives."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.extraction_exigences_administratives import (
    ExtractionExigencesAdministratives,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_extracts_admin_with_source():
    fake_response = {
        "exigences": [
            {
                "type_piece": "Attestation de vigilance URSSAF",
                "description": "Attestation de moins de 6 mois",
                "validite_requise": "moins de 6 mois",
                "document_source": "RC",
                "page_source": 7,
                "categorie": "admin",
            }
        ],
        "confidence": 0.93,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExtractionExigencesAdministratives()
    output = await skill.run(
        Input(project_id=1, rc_text="Le candidat fournit une attestation URSSAF de moins de 6 mois."),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.exigences[0].document_source == "RC"
    assert output.exigences[0].validite_requise == "moins de 6 mois"


def test_metadata():
    assert ExtractionExigencesAdministratives.name == "extraction-exigences-administratives"
    assert ExtractionExigencesAdministratives.category == "extraction"
    assert ExtractionExigencesAdministratives.model == "claude-sonnet-4-6"
    assert ExtractionExigencesAdministratives.notebook_sources == ["N2"]
    assert ExtractionExigencesAdministratives.pipeline_step == 3
