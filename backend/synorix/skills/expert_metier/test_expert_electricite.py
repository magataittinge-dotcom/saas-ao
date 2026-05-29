"""Tests for skill #28 expert-electricite."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.expert_metier.expert_electricite import (
    ExpertElectricite,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_expert_electricite_basic_structure():
    """Output with ≥ 4 phases citing NF C 15-100-1 + NF C 18-510."""
    fake_response = {
        "methodologie": {
            "phases": [
                {
                    "nom": "Préparation & études",
                    "description": "Calculs sections, sélectivité, ETEL.",
                    "normes_appliquees": ["NF C 15-100-1"],
                    "valeurs_chiffrees": {},
                },
                {
                    "nom": "Approvisionnement",
                    "description": "Marquage CE/NF, DDR Type F + DPDA.",
                    "normes_appliquees": ["NF C 15-100-1"],
                    "valeurs_chiffrees": {"ddr_mA": "30"},
                },
                {
                    "nom": "Mise en œuvre",
                    "description": "GTL, mise à la terre, volumes 7-701.",
                    "normes_appliquees": ["NF C 15-100-10", "NF C 15-100-7-701", "NF C 18-510"],
                    "valeurs_chiffrees": {
                        "section_eclairage_mm2": "1,5",
                        "section_plaque_cuisson_mm2": "6",
                    },
                },
                {
                    "nom": "Contrôles & réception",
                    "description": "Isolement, continuité, DDR, Consuel.",
                    "normes_appliquees": ["NF C 15-100-1"],
                    "valeurs_chiffrees": {},
                },
            ],
            "normes_citees": ["NF C 15-100-1", "NF C 15-100-10", "NF C 14-100", "NF C 18-510"],
            "phrases_types": ["..."] * 8,
            "controles_obligatoires": ["Isolement", "Continuité", "Déclenchement DDR 30 mA"],
            "livrables_exiges": ["DOE", "PAQ", "AC Consuel"],
            "points_vigilance": ["Sécurité incendie 1 %", "Volumes 7-701"],
        },
        "sources_nbk": ["N4", "N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExpertElectricite()
    output = await skill.run(
        Input(
            project_id=1,
            cctp_text="Installation électrique ERP type R, IRVE 4 bornes.",
            contraintes_chantier=["site occupé", "exigence IRVE niveau 3"],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.methodologie.phases) >= 4
    assert "NF C 15-100-1" in output.methodologie.normes_citees
    assert "NF C 18-510" in output.methodologie.normes_citees
    assert "N4" in output.sources_nbk


def test_expert_electricite_metadata():
    """Correct Synorix v2.1 metadata."""
    assert ExpertElectricite.name == "expert-electricite"
    assert ExpertElectricite.category == "expert-metier"
    assert ExpertElectricite.model == "claude-sonnet-4-6"
    assert ExpertElectricite.notebook_sources == ["N4", "N3"]
    assert ExpertElectricite.pipeline_step == 3
