"""Tests for skill #77 recherche-format-references-chantiers."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.sidebar.recherche_format_references_chantiers import (
    RechercheFormatReferencesChantiers,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_format_references_structure():
    fake = {
        "champs_obligatoires": [
            {"nom": "Année", "type": "date"}, {"nom": "Intitulé", "type": "string"},
            {"nom": "MOA", "type": "string"}, {"nom": "Lot", "type": "string"},
            {"nom": "Montant HT", "type": "number"}, {"nom": "Contraintes surmontées", "type": "string"},
            {"nom": "Contact MOA", "type": "string"},
        ],
        "champs_optionnels": [{"nom": "Photos", "type": "fichier"}],
        "metadonnees_reutilisation": ["score de pertinence (#37)"],
        "sources_nbk": ["N3"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RechercheFormatReferencesChantiers()
    output = await skill.run(Input(project_id=1), client=client_mock)

    assert isinstance(output, Output)
    noms = [c.nom for c in output.champs_obligatoires]
    assert "Montant HT" in noms
    assert any("pertinence" in m for m in output.metadonnees_reutilisation)


def test_format_references_metadata():
    assert RechercheFormatReferencesChantiers.name == "recherche-format-references-chantiers"
    assert RechercheFormatReferencesChantiers.category == "sidebar"
    assert RechercheFormatReferencesChantiers.model == "claude-sonnet-4-6"
