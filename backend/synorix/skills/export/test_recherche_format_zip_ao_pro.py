"""Tests for skill #72 recherche-format-zip-ao-pro."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.export.recherche_format_zip_ao_pro import (
    RechercheFormatZipAoPro,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_zip_structure():
    fake = {
        "structure_zip": {
            "racine": ["Checklist_depot.pdf"],
            "dossiers": [
                {"nom": "Candidature", "contenu": ["Societe_DC1", "Societe_DC2"]},
                {"nom": "Offre_Lot_1", "contenu": ["Societe_AE", "Societe_Memoire_technique"]},
            ],
        },
        "regles": ["pas d'espaces/accents", "≤ 1 Go/fichier PLACE"],
        "sources_nbk": ["N5"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RechercheFormatZipAoPro()
    output = await skill.run(Input(project_id=1, lots=["Lot 1"]), client=client_mock)

    assert isinstance(output, Output)
    noms = [d.nom for d in output.structure_zip.dossiers]
    assert any("Candidature" in n for n in noms)
    assert any("Offre" in n for n in noms)


def test_zip_metadata():
    assert RechercheFormatZipAoPro.name == "recherche-format-zip-ao-pro"
    assert RechercheFormatZipAoPro.category == "export"
    assert RechercheFormatZipAoPro.model == "claude-haiku-4-5"
    assert RechercheFormatZipAoPro.pipeline_step == 6
