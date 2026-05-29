"""Tests for skill #25 expert-facade."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.expert_metier.expert_facade import ExpertFacade, Input, Output


@pytest.mark.asyncio
async def test_expert_facade_basic_structure():
    """The skill returns an Output with at least 4 phases and cites NF DTU 59.1 + 44.1."""
    fake_response = {
        "methodologie": {
            "phases": [
                {
                    "nom": "Préparation & études",
                    "description": "Reconnaissance contradictoire, humidité < 5 %.",
                    "normes_appliquees": ["NF DTU 59.1", "NF DTU 20.1"],
                    "valeurs_chiffrees": {"humidite_max_support_pct": "5"},
                },
                {
                    "nom": "Approvisionnement & matériel",
                    "description": "Échafaudage, teintes Y > 35 %.",
                    "normes_appliquees": ["NF DTU 26.1"],
                    "valeurs_chiffrees": {"indice_luminance_Y_min_pct": "35"},
                },
                {
                    "nom": "Mise en œuvre",
                    "description": "Application 5-35 °C, classes I1-I4.",
                    "normes_appliquees": ["NF DTU 42.1", "NF DTU 44.1"],
                    "valeurs_chiffrees": {"temperature_min_C": "5", "temperature_max_C": "35"},
                },
                {
                    "nom": "Contrôles & réception",
                    "description": "Contrôle visuel à 2 m.",
                    "normes_appliquees": ["NF DTU 59.1"],
                    "valeurs_chiffrees": {"distance_controle_m": "2"},
                },
            ],
            "normes_citees": ["NF DTU 26.1", "NF DTU 42.1", "NF DTU 59.1", "NF DTU 44.1"],
            "phrases_types": ["..."] * 8,
            "controles_obligatoires": ["Essai d'adhérence", "Sondage sonore"],
            "livrables_exiges": ["DOE", "PAQ", "PV adhérence", "Fiches autocontrôle"],
            "points_vigilance": ["Fissuration 40 %", "Calfeutrement sur gros œuvre"],
        },
        "sources_nbk": ["N4", "N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExpertFacade()
    output = await skill.run(
        Input(
            project_id=1,
            cctp_text="Ravalement façade école Reims, enduit monocouche.",
            contraintes_chantier=["site occupé", "intempéries fréquentes"],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.methodologie.phases) >= 4
    assert "NF DTU 59.1" in output.methodologie.normes_citees
    assert "NF DTU 44.1" in output.methodologie.normes_citees
    assert "N4" in output.sources_nbk


def test_expert_facade_metadata():
    """The skill exposes correct Synorix v2.1 metadata."""
    assert ExpertFacade.name == "expert-facade"
    assert ExpertFacade.category == "expert-metier"
    assert ExpertFacade.model == "claude-sonnet-4-6"
    assert ExpertFacade.notebook_sources == ["N4", "N3"]
    assert ExpertFacade.pipeline_step == 3
