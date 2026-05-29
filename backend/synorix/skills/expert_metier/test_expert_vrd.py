"""Tests for skill #32 expert-vrd."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.expert_metier.expert_vrd import ExpertVRD, Input, Output


@pytest.mark.asyncio
async def test_expert_vrd_basic_structure():
    """Output with ≥ 4 phases citing NF P 98-331 + NF EN 1610."""
    fake_response = {
        "methodologie": {
            "phases": [
                {
                    "nom": "Préparation & études",
                    "description": "DT-DICT, AIPR, étude géotechnique G4.",
                    "normes_appliquees": ["NF P 94-500", "Fascicule 70"],
                    "valeurs_chiffrees": {},
                },
                {
                    "nom": "Approvisionnement",
                    "description": "Canalisations NF 442, regards NF EN 124.",
                    "normes_appliquees": ["NF 442", "NF EN 124"],
                    "valeurs_chiffrees": {},
                },
                {
                    "nom": "Mise en œuvre",
                    "description": "Lit de pose, pose aval->amont, remblayage.",
                    "normes_appliquees": ["Fascicule 70", "Fascicule 71", "NF P 98-331"],
                    "valeurs_chiffrees": {
                        "lit_pose_m_min": "0,10",
                        "pente_assainissement_permil": "5",
                        "remblai_couche_max_cm": "30",
                    },
                },
                {
                    "nom": "Contrôles & réception",
                    "description": "Q4/Q5, NF EN 1610, ITV, COFRAC.",
                    "normes_appliquees": ["NF P 98-331", "NF EN 1610", "NF EN 805"],
                    "valeurs_chiffrees": {
                        "Q4_OPN_min_pct": "95",
                        "Q5_OPN_min_pct": "90",
                    },
                },
            ],
            "normes_citees": ["Fascicule 2 CCTG", "Fascicule 70", "Fascicule 71", "NF P 98-331", "NF EN 1610", "NF EN 805"],
            "phrases_types": ["..."] * 9,
            "controles_obligatoires": ["Compactage Q4/Q5", "Étanchéité NF EN 1610", "ITV NF EN 13508-2"],
            "livrables_exiges": ["DOE", "Plans de récolement", "DIUO", "PV COFRAC"],
            "points_vigilance": ["Tassements RGA", "DT-DICT respect", "Infiltrations H2S"],
        },
        "sources_nbk": ["N4", "N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExpertVRD()
    output = await skill.run(
        Input(
            project_id=1,
            cctp_text="Aménagement parking 5000 m² + réseaux EU/EP/AEP.",
            contraintes_chantier=["sol argileux RGA", "réseaux concessionnaires denses"],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.methodologie.phases) >= 4
    assert "NF P 98-331" in output.methodologie.normes_citees
    assert "NF EN 1610" in output.methodologie.normes_citees
    assert "N4" in output.sources_nbk


def test_expert_vrd_metadata():
    """Correct Synorix v2.1 metadata."""
    assert ExpertVRD.name == "expert-vrd"
    assert ExpertVRD.category == "expert-metier"
    assert ExpertVRD.model == "claude-sonnet-4-6"
    assert ExpertVRD.notebook_sources == ["N4", "N3"]
    assert ExpertVRD.pipeline_step == 3
