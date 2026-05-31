"""Tests for skill #1 recherche-types-documents."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.upload.recherche_types_documents import (
    RechercheTypesDocuments,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_classifies_rc():
    """A well-named RC file is classified as type RC / administratif."""
    fake_response = {
        "type_canonique": "RC",
        "libelle": "Règlement de la consultation",
        "categorie": "administratif",
        "confidence": 0.96,
        "not_found": False,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = RechercheTypesDocuments()
    output = await skill.run(
        Input(
            project_id=1,
            filename="01_RC.pdf",
            text_excerpt="Le présent règlement de la consultation fixe les modalités…",
            mime_type="application/pdf",
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.type_canonique == "RC"
    assert output.categorie == "administratif"
    assert output.not_found is False


@pytest.mark.asyncio
async def test_unknown_returns_not_found():
    """An unrecognisable file falls back to autre / not_found with low confidence."""
    fake_response = {
        "type_canonique": "autre",
        "libelle": "Document non identifié",
        "categorie": "annexe",
        "confidence": 0.2,
        "not_found": True,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = RechercheTypesDocuments()
    output = await skill.run(
        Input(project_id=1, filename="scan0001.pdf", text_excerpt=""),
        client=client_mock,
    )

    assert output.not_found is True
    assert output.confidence < 0.5


def test_metadata():
    assert RechercheTypesDocuments.name == "recherche-types-documents"
    assert RechercheTypesDocuments.category == "upload"
    assert RechercheTypesDocuments.model == "claude-haiku-4-5"
    assert RechercheTypesDocuments.notebook_sources == ["N2"]
    assert RechercheTypesDocuments.pipeline_step == 1
