"""Tests for skill #11 extraction-pieces-offre."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.extraction_pieces_offre import (
    ExtractionPiecesOffre,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_extracts_offer_pieces():
    fake_response = {
        "pieces": [
            {
                "nom_piece": "Acte d'Engagement (ATTRI1)",
                "description": "AE signé",
                "format_attendu": ".pdf signé",
                "page_source": 3,
                "document_source": "RC",
                "categorie": "offre",
            },
            {
                "nom_piece": "DPGF complétée",
                "description": "Décomposition du prix",
                "format_attendu": ".xlsx",
                "page_source": 3,
                "document_source": "RC",
                "categorie": "offre",
            },
        ],
        "confidence": 0.9,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExtractionPiecesOffre()
    output = await skill.run(
        Input(project_id=1, rc_text="L'offre comprend l'AE signé et la DPGF complétée au format xlsx."),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.pieces) == 2
    assert all(p.categorie == "offre" for p in output.pieces)


def test_metadata():
    assert ExtractionPiecesOffre.name == "extraction-pieces-offre"
    assert ExtractionPiecesOffre.category == "extraction"
    assert ExtractionPiecesOffre.model == "claude-sonnet-4-6"
    assert ExtractionPiecesOffre.notebook_sources == ["N2"]
    assert ExtractionPiecesOffre.pipeline_step == 3
