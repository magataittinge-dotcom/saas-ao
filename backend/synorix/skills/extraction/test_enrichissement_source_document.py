"""Tests for skill #19 enrichissement-source-document."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.enrichissement_source_document import (
    EnrichissementSourceDocument,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_resolves_page():
    fake_response = {
        "document": "CCTP Lot 5",
        "page": 12,
        "offset_debut": 4501,
        "offset_fin": 4620,
        "not_found": False,
        "confidence": 0.97,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = EnrichissementSourceDocument()
    output = await skill.run(
        Input(
            project_id=1,
            document="CCTP Lot 5",
            extrait="Le titulaire respecte le NF DTU 43.1.",
            offset_debut=4501,
            offset_fin=4620,
            page_map={"4501": 12},
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.page == 12
    assert output.not_found is False


def test_metadata():
    assert EnrichissementSourceDocument.name == "enrichissement-source-document"
    assert EnrichissementSourceDocument.category == "extraction"
    assert EnrichissementSourceDocument.model == "claude-haiku-4-5"
    assert EnrichissementSourceDocument.notebook_sources == []
    assert EnrichissementSourceDocument.pipeline_step == 3
