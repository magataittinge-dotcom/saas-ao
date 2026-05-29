"""Tests for skill #27 expert-gros-oeuvre."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.expert_metier.expert_gros_oeuvre import (
    ExpertGrosOeuvre,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_expert_gros_oeuvre_basic_structure():
    """Output with ≥ 4 phases citing NF DTU 21 + NF EN 206/CN."""
    fake_response = {
        "methodologie": {
            "phases": [
                {
                    "nom": "Préparation & études",
                    "description": "Étude G2/G4, plans + notes de calcul.",
                    "normes_appliquees": ["NF P 94-500", "Eurocode 2"],
                    "valeurs_chiffrees": {"mission_geotechnique": "G2"},
                },
                {
                    "nom": "Approvisionnement",
                    "description": "BPE conforme NF EN 206/CN.",
                    "normes_appliquees": ["NF EN 206/CN", "NF A 35-014"],
                    "valeurs_chiffrees": {},
                },
                {
                    "nom": "Mise en œuvre",
                    "description": "Fondations + maçonnerie + béton armé.",
                    "normes_appliquees": ["NF DTU 13.1", "NF DTU 20.1", "NF DTU 21", "Eurocode 8"],
                    "valeurs_chiffrees": {
                        "beton_classe": "C25/30",
                        "enrobage_propre_cm": "3",
                        "joints_dilatation_m": "5-8",
                    },
                },
                {
                    "nom": "Contrôles & réception",
                    "description": "Compression 28 j, tolérances.",
                    "normes_appliquees": ["NF DTU 21"],
                    "valeurs_chiffrees": {
                        "verticalite_mm_sur_3m": "15",
                        "planeite_mm_regle_2m": "10",
                    },
                },
            ],
            "normes_citees": ["NF DTU 13.1", "NF DTU 20.1", "NF DTU 21", "NF EN 206/CN", "Eurocode 2", "Eurocode 8"],
            "phrases_types": ["..."] * 8,
            "controles_obligatoires": ["Essais compression 28 j", "Fiches autocontrôle ferraillage"],
            "livrables_exiges": ["DOE", "PAQ", "Plans de récolement", "DIUO"],
            "points_vigilance": ["Fondations 10,1 % coût total", "Étanchéité 64 %"],
        },
        "sources_nbk": ["N4", "N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExpertGrosOeuvre()
    output = await skill.run(
        Input(
            project_id=1,
            cctp_text="Construction immeuble R+5 zone sismique 3.",
            contraintes_chantier=["sol argileux", "voisinage occupé"],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.methodologie.phases) >= 4
    assert "NF DTU 21" in output.methodologie.normes_citees
    assert "NF EN 206/CN" in output.methodologie.normes_citees
    assert "N4" in output.sources_nbk


def test_expert_gros_oeuvre_metadata():
    """Correct Synorix v2.1 metadata."""
    assert ExpertGrosOeuvre.name == "expert-gros-oeuvre"
    assert ExpertGrosOeuvre.category == "expert-metier"
    assert ExpertGrosOeuvre.model == "claude-sonnet-4-6"
    assert ExpertGrosOeuvre.notebook_sources == ["N4", "N3"]
    assert ExpertGrosOeuvre.pipeline_step == 3
