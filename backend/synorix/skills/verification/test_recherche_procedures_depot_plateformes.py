"""Tests for skill #67 recherche-procedures-depot-plateformes."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.verification.recherche_procedures_depot_plateformes import (
    RechercheProceduresDepotPlateformes,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_procedures_depot_structure():
    fake = {
        "plateforme": "AWS",
        "etapes": [
            {"ordre": 1, "intitule": "Préparation du pli", "detail": "Sélection des lots"},
            {"ordre": 2, "intitule": "Chargement", "detail": "Lier les dossiers"},
            {"ordre": 3, "intitule": "Signature", "detail": "Chaque pièce individuellement"},
            {"ordre": 4, "intitule": "Transmission", "detail": "Déposer avant l'heure limite"},
        ],
        "contraintes_techniques": ["chiffrement automatique"],
        "preuves_a_conserver": ["attestation de dépôt", "bordereau de contrôle"],
        "sources_nbk": ["N5"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RechercheProceduresDepotPlateformes()
    output = await skill.run(Input(project_id=1, plateforme="AWS"), client=client_mock)

    assert isinstance(output, Output)
    assert len(output.etapes) >= 4
    assert output.preuves_a_conserver


def test_procedures_depot_metadata():
    assert RechercheProceduresDepotPlateformes.name == "recherche-procedures-depot-plateformes"
    assert RechercheProceduresDepotPlateformes.category == "verification"
    assert RechercheProceduresDepotPlateformes.model == "claude-sonnet-4-6"
    assert RechercheProceduresDepotPlateformes.notebook_sources == ["N5"]
