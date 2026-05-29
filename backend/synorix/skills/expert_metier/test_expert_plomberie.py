"""Tests for skill #30 expert-plomberie."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.expert_metier.expert_plomberie import (
    ExpertPlomberie,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_expert_plomberie_basic_structure():
    """Output with ≥ 4 phases citing NF DTU 60.1 + NF DTU 60.11."""
    fake_response = {
        "methodologie": {
            "phases": [
                {
                    "nom": "Préparation & études",
                    "description": "Calcul débits, dimensionnement.",
                    "normes_appliquees": ["NF DTU 60.11"],
                    "valeurs_chiffrees": {},
                },
                {
                    "nom": "Approvisionnement",
                    "description": "Tubes ACS, NF 442, robinetterie NF.",
                    "normes_appliquees": ["NF DTU 60.1 P1-2"],
                    "valeurs_chiffrees": {},
                },
                {
                    "nom": "Mise en œuvre",
                    "description": "Siphons + ECS + LES + disconnecteurs.",
                    "normes_appliquees": ["NF DTU 60.1 P1-1-2", "NF DTU 60.1 P1-1-3", "NF C 15-100"],
                    "valeurs_chiffrees": {
                        "garde_eau_min_mm": "50",
                        "distance_groupe_securite_max_m": "3",
                    },
                },
                {
                    "nom": "Contrôles & réception",
                    "description": "Pression + désinfection + analyses légionellose.",
                    "normes_appliquees": ["Fascicule 71 Art. 63", "NF EN 1610", "Fascicule 71 Art. 70"],
                    "valeurs_chiffrees": {
                        "maintien_pression_min": "30",
                        "baisse_max_kPa": "20",
                    },
                },
            ],
            "normes_citees": ["NF DTU 60.1", "NF DTU 60.11", "NF DTU 65.16", "Fascicule 71", "NF EN 805", "NF EN 1610"],
            "phrases_types": ["..."] * 9,
            "controles_obligatoires": ["Épreuves pression", "Désinfection + analyses laboratoire"],
            "livrables_exiges": ["DOE", "PAQ", "PV épreuves pression", "PV désinfection"],
            "points_vigilance": ["Étanchéité 64 %", "Sanitaires 10,8 %", "Légionellose"],
        },
        "sources_nbk": ["N4", "N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExpertPlomberie()
    output = await skill.run(
        Input(
            project_id=1,
            cctp_text="Plomberie sanitaire collectif R+5, chauffage PAC.",
            contraintes_chantier=["prévention légionellose", "site occupé"],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.methodologie.phases) >= 4
    assert "NF DTU 60.1" in output.methodologie.normes_citees
    assert "NF DTU 60.11" in output.methodologie.normes_citees
    assert "N4" in output.sources_nbk


def test_expert_plomberie_metadata():
    """Correct Synorix v2.1 metadata."""
    assert ExpertPlomberie.name == "expert-plomberie"
    assert ExpertPlomberie.category == "expert-metier"
    assert ExpertPlomberie.model == "claude-sonnet-4-6"
    assert ExpertPlomberie.notebook_sources == ["N4", "N3"]
    assert ExpertPlomberie.pipeline_step == 3
