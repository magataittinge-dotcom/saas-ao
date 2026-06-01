"""Tests for skill #66 recherche-nomenclature-fichiers-ao."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.verification.recherche_nomenclature_fichiers_ao import (
    RechercheNomenclatureFichiersAo,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_nomenclature_structure():
    fake = {
        "fichiers_normalises": [
            {"libelle_piece": "Mémoire technique", "nom_propose": "Cariso_Memoire_technique", "alertes": []},
            {"libelle_piece": "DC1", "nom_propose": "Cariso_DC1", "alertes": []},
        ],
        "regles_appliquees": ["pas d'accents", "max 30 caractères", "underscores"],
        "sources_nbk": ["N5"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RechercheNomenclatureFichiersAo()
    output = await skill.run(
        Input(project_id=1, nom_entreprise="Cariso", pieces=["Mémoire technique", "DC1"]),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert all(" " not in f.nom_propose for f in output.fichiers_normalises)
    assert output.sources_nbk == ["N5"]


def test_nomenclature_metadata():
    assert RechercheNomenclatureFichiersAo.name == "recherche-nomenclature-fichiers-ao"
    assert RechercheNomenclatureFichiersAo.category == "verification"
    assert RechercheNomenclatureFichiersAo.model == "claude-haiku-4-5"
    assert RechercheNomenclatureFichiersAo.notebook_sources == ["N5"]
