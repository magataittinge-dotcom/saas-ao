"""Tests for skill #79 recherche-coffre-fort-pieces-administratives."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.sidebar.recherche_coffre_fort_pieces_administratives import (
    RechercheCoffreFortPiecesAdministratives,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_coffre_fort_categories():
    fake = {
        "categories": [
            {"nom": "DC1", "famille": "candidature", "alias": ["lettre de candidature"],
             "validite": "par consultation", "document_origine": "Cerfa", "alternatives": ["DUME"]},
            {"nom": "Kbis", "famille": "identite", "alias": [], "validite": "≤ 3 mois",
             "document_origine": "greffe", "alternatives": []},
            {"nom": "NOTI7", "famille": "post-attribution", "alias": ["garantie à première demande"],
             "validite": "jusqu'à levée des réserves", "document_origine": "Cerfa", "alternatives": ["NOTI8"]},
        ],
        "nb_categories": 34,
        "sources_nbk": ["N2"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RechercheCoffreFortPiecesAdministratives()
    output = await skill.run(Input(project_id=1), client=client_mock)

    assert isinstance(output, Output)
    assert output.nb_categories >= 30
    assert any(c.nom == "Kbis" for c in output.categories)


def test_coffre_fort_metadata():
    assert RechercheCoffreFortPiecesAdministratives.name == "recherche-coffre-fort-pieces-administratives"
    assert RechercheCoffreFortPiecesAdministratives.category == "sidebar"
    assert RechercheCoffreFortPiecesAdministratives.model == "claude-sonnet-4-6"
    assert RechercheCoffreFortPiecesAdministratives.notebook_sources == ["N2"]
