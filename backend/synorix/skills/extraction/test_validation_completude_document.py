"""Tests for skill #22 validation-completude-document."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.validation_completude_document import (
    ValidationCompletudeDocument,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_flags_incomplete():
    fake_response = {
        "is_complete": False,
        "champs_manquants": ["Montant TTC", "Signature"],
        "confidence": 0.9,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ValidationCompletudeDocument()
    output = await skill.run(
        Input(project_id=1, type_document="AE", snapshot="Montant HT renseigné, TTC vide, pas de signature."),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.is_complete is False
    assert "Signature" in output.champs_manquants


def test_metadata():
    assert ValidationCompletudeDocument.name == "validation-completude-document"
    assert ValidationCompletudeDocument.category == "extraction"
    assert ValidationCompletudeDocument.model == "claude-haiku-4-5"
    assert ValidationCompletudeDocument.notebook_sources == ["N2"]
    assert ValidationCompletudeDocument.pipeline_step == 3
