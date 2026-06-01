"""Tests for skill #39 extraction-memoire-importe."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.sidebar.extraction_memoire_importe import (
    ExtractionMemoireImporte,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_extraction_memoire_importe_structure():
    """Identifies 5+ classic sections and tags paragraphs by section + métier."""
    fake_response = {
        "sections_identifiees": [
            "presentation entreprise",
            "references chantiers",
            "methodologie",
            "securite",
            "environnement",
        ],
        "paragraphes": [
            {
                "ordre": 0,
                "extrait": "Notre société, certifiée Qualibat RGE...",
                "section": "presentation entreprise",
                "corps_de_metier": "transverse",
                "reutilisable": False,
                "indices": ["Qualibat", "RGE"],
            },
            {
                "ordre": 1,
                "extrait": "Nous fixons les panneaux ITE par calage-chevillage (DTU 45.2)...",
                "section": "methodologie",
                "corps_de_metier": "Façade/ITE",
                "reutilisable": True,
                "indices": ["ETICS", "DTU 45.2", "test d'arrachement"],
            },
        ],
        "corps_de_metiers_detectes": ["Façade/ITE"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExtractionMemoireImporte()
    output = await skill.run(
        Input(project_id=1, user_id=7, memoire_text="...", filename="memo.docx"),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.sections_identifiees) >= 5
    assert any(p.corps_de_metier == "Façade/ITE" for p in output.paragraphes)


def test_extraction_memoire_importe_metadata():
    assert ExtractionMemoireImporte.name == "extraction-memoire-importe"
    assert ExtractionMemoireImporte.category == "sidebar"
    assert ExtractionMemoireImporte.model == "claude-sonnet-4-6"
    assert ExtractionMemoireImporte.notebook_sources == ["N3"]
    assert ExtractionMemoireImporte.pipeline_step == "sidebar"
