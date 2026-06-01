"""Tests for skill #76 recherche-structure-profil-entreprise-btp."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.sidebar.recherche_structure_profil_entreprise_btp import (
    RechercheStructureProfilEntrepriseBtp,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_structure_profil_btp():
    fake = {
        "sections": [
            {"nom": "Identité", "champs": [{"nom": "SIRET", "type": "string", "validation": "14 chiffres", "obligatoire": True}]},
            {"nom": "Capacités économiques", "champs": [{"nom": "CA N-1", "type": "number", "validation": "> 0", "obligatoire": True}]},
            {"nom": "Capacités techniques", "champs": [{"nom": "Qualifications", "type": "liste", "validation": "date validité", "obligatoire": False}]},
        ],
        "couvre_dc2": True,
        "sources_nbk": ["N2"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RechercheStructureProfilEntrepriseBtp()
    output = await skill.run(Input(project_id=1), client=client_mock)

    assert isinstance(output, Output)
    assert len(output.sections) >= 3
    assert output.couvre_dc2 is True


def test_structure_profil_metadata():
    assert RechercheStructureProfilEntrepriseBtp.name == "recherche-structure-profil-entreprise-btp"
    assert RechercheStructureProfilEntrepriseBtp.category == "sidebar"
    assert RechercheStructureProfilEntrepriseBtp.model == "claude-sonnet-4-6"
    assert RechercheStructureProfilEntrepriseBtp.notebook_sources == ["N2"]
