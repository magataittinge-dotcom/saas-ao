"""Tests for skill #31 expert-peinture."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.expert_metier.expert_peinture import (
    ExpertPeinture,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_expert_peinture_basic_structure():
    """Output with ≥ 4 phases citing NF DTU 59.1 + NF DTU 25.41."""
    fake_response = {
        "methodologie": {
            "phases": [
                {
                    "nom": "Préparation & études",
                    "description": "Humidité < 5 %, choix finition A/B/C.",
                    "normes_appliquees": ["NF DTU 59.1"],
                    "valeurs_chiffrees": {"humidite_max_pct": "5"},
                },
                {
                    "nom": "Approvisionnement",
                    "description": "Étiquetage A+, écolabel.",
                    "normes_appliquees": ["NF EN 13 300"],
                    "valeurs_chiffrees": {},
                },
                {
                    "nom": "Mise en œuvre",
                    "description": "Séchage joints 7 j, impression + finition.",
                    "normes_appliquees": ["NF DTU 59.1", "NF DTU 25.41"],
                    "valeurs_chiffrees": {"sechage_joints_jours": "7"},
                },
                {
                    "nom": "Contrôles & réception",
                    "description": "Contrôle visuel à 2 m sans lumière rasante.",
                    "normes_appliquees": ["NF DTU 59.1"],
                    "valeurs_chiffrees": {"distance_controle_m": "2"},
                },
            ],
            "normes_citees": ["NF DTU 59.1", "NF DTU 25.41", "NF DTU 59.4", "NF EN 13 300"],
            "phrases_types": ["..."] * 8,
            "controles_obligatoires": ["Humidité support", "Essai goutte d'eau", "Contrôle visuel 2 m"],
            "livrables_exiges": ["DOE", "PAQ", "Fiches autocontrôle"],
            "points_vigilance": ["Décollements 34-40 %", "Spectres sous lumière rasante"],
        },
        "sources_nbk": ["N4", "N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExpertPeinture()
    output = await skill.run(
        Input(
            project_id=1,
            cctp_text="Peinture salles de classe école Reims, finition B.",
            contraintes_chantier=["site occupé", "exigence A+"],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.methodologie.phases) >= 4
    assert "NF DTU 59.1" in output.methodologie.normes_citees
    assert "NF DTU 25.41" in output.methodologie.normes_citees
    assert "N4" in output.sources_nbk


def test_expert_peinture_metadata():
    """Correct Synorix v2.1 metadata."""
    assert ExpertPeinture.name == "expert-peinture"
    assert ExpertPeinture.category == "expert-metier"
    assert ExpertPeinture.model == "claude-sonnet-4-6"
    assert ExpertPeinture.notebook_sources == ["N4", "N3"]
    assert ExpertPeinture.pipeline_step == 3
