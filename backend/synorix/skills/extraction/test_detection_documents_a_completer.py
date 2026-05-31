"""Tests for skill #21 detection-documents-a-completer."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.detection_documents_a_completer import (
    DetectionDocumentsACompleter,
    DocumentDce,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_detects_templates():
    fake_response = {
        "a_completer": [
            {"filename": "DPGF_Vierge.xlsx", "type_document": "DPGF", "format_edition": "tableau"},
            {"filename": "DC1.pdf", "type_document": "DC1", "format_edition": "cerfa"},
        ],
        "confidence": 0.92,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionDocumentsACompleter()
    output = await skill.run(
        Input(
            project_id=1,
            documents=[
                DocumentDce(filename="DPGF_Vierge.xlsx", type_detecte="DPGF"),
                DocumentDce(filename="DC1.pdf", type_detecte="DC1"),
                DocumentDce(filename="CCTP.pdf", type_detecte="CCTP"),
            ],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.a_completer) == 2
    assert output.a_completer[0].format_edition == "tableau"


def test_metadata():
    assert DetectionDocumentsACompleter.name == "detection-documents-a-completer"
    assert DetectionDocumentsACompleter.category == "extraction"
    assert DetectionDocumentsACompleter.model == "claude-sonnet-4-6"
    assert DetectionDocumentsACompleter.notebook_sources == ["N2"]
    assert DetectionDocumentsACompleter.pipeline_step == 3
