"""Tests for skill #74 recherche-checklist-depot-plateforme."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.export.recherche_checklist_depot_plateforme import (
    RechercheChecklistDepotPlateforme,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_checklist_structure():
    fake = {
        "checklist": [
            {"item": "Bon lot sélectionné", "categorie": "lot", "coche": False},
            {"item": "Signature par fichier", "categorie": "signature", "coche": False},
            {"item": "Avant l'heure limite", "categorie": "delai", "coche": False},
        ],
        "pieges_frequents": ["mauvais lot", "signature manquante"],
        "sources_nbk": ["N5"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RechercheChecklistDepotPlateforme()
    output = await skill.run(Input(project_id=1, plateforme="PLACE"), client=client_mock)

    assert isinstance(output, Output)
    assert all(i.coche is False for i in output.checklist)
    assert output.pieges_frequents


def test_checklist_metadata():
    assert RechercheChecklistDepotPlateforme.name == "recherche-checklist-depot-plateforme"
    assert RechercheChecklistDepotPlateforme.category == "export"
    assert RechercheChecklistDepotPlateforme.model == "claude-sonnet-4-6"
    assert RechercheChecklistDepotPlateforme.pipeline_step == 6
