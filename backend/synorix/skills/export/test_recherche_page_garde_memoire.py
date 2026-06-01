"""Tests for skill #73 recherche-page-garde-memoire."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.export.recherche_page_garde_memoire import (
    RecherchePageGardeMemoire,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_page_garde_structure():
    fake = {
        "page_garde": {
            "elements": [
                {"champ": "Lot", "valeur": "Lot 3 ITE"},
                {"champ": "MOA", "valeur": "Ville de Reims"},
                {"champ": "Intitulé AO", "valeur": "Rénovation école"},
                {"champ": "Référence", "valeur": "2026-AO-014"},
                {"champ": "Date", "valeur": "2026-06-15"},
            ],
            "logos_reassurance": ["[À COMPLÉTER PAR L'ENTREPRISE]"],
            "charte": "Couleurs entreprise dans les titres",
            "chaine_sommaire": True,
        },
        "champs_a_completer": ["Logos certifications"],
        "sources_nbk": ["N3"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RecherchePageGardeMemoire()
    output = await skill.run(
        Input(project_id=1, intitule_ao="Rénovation école", lot="Lot 3 ITE", moa="Ville de Reims"),
        client=client_mock,
    )

    assert isinstance(output, Output)
    champs = [e.champ.lower() for e in output.page_garde.elements]
    assert any("lot" in c for c in champs) and any("moa" in c for c in champs)


def test_page_garde_metadata():
    assert RecherchePageGardeMemoire.name == "recherche-page-garde-memoire"
    assert RecherchePageGardeMemoire.category == "export"
    assert RecherchePageGardeMemoire.model == "claude-sonnet-4-6"
    assert RecherchePageGardeMemoire.differentiateur == 2
