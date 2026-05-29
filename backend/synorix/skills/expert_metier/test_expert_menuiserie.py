"""Tests for skill #33 expert-menuiserie."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.expert_metier.expert_menuiserie import (
    ExpertMenuiserie,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_expert_menuiserie_basic_structure():
    """Output with ≥ 4 phases citing NF DTU 36.5 + NF DTU 44.1."""
    fake_response = {
        "methodologie": {
            "phases": [
                {
                    "nom": "Préparation & études",
                    "description": "Reconnaissance dormants, choix AEV.",
                    "normes_appliquees": ["NF DTU 36.5 P1-1", "FD DTU 36.5 P3"],
                    "valeurs_chiffrees": {},
                },
                {
                    "nom": "Approvisionnement",
                    "description": "Menuiseries NF/CSTBat, vitrages CEKAL, mastics 25 E.",
                    "normes_appliquees": ["NF DTU 36.5 P1-2", "NF EN ISO 11600"],
                    "valeurs_chiffrees": {},
                },
                {
                    "nom": "Mise en œuvre",
                    "description": "Pose applique/tunnel/feuillure + calfeutrement gros œuvre.",
                    "normes_appliquees": ["NF DTU 36.5", "NF DTU 44.1", "NF DTU 68.3"],
                    "valeurs_chiffrees": {
                        "fixation_espacement_max_m": "0,80",
                        "joint_mastic_largeur_mm": "5-20",
                    },
                },
                {
                    "nom": "Contrôles & réception",
                    "description": "Tolérances 2 mm/m, essais AEV in situ.",
                    "normes_appliquees": ["NF DTU 36.5", "NF EN 13051"],
                    "valeurs_chiffrees": {"verticalite_mm_par_m": "2"},
                },
            ],
            "normes_citees": ["NF DTU 36.5", "NF DTU 44.1", "NF DTU 68.3", "NF EN ISO 11600", "NF EN 13051"],
            "phrases_types": ["..."] * 10,
            "controles_obligatoires": ["Tolérances pose", "Calfeutrement continu", "Essais AEV in situ"],
            "livrables_exiges": ["DOE", "PAQ", "Notice maintenance"],
            "points_vigilance": ["Infiltrations 33,5 %", "Calfeutrement 28,9 %", "Mousse expansive proscrite"],
        },
        "sources_nbk": ["N4", "N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExpertMenuiserie()
    output = await skill.run(
        Input(
            project_id=1,
            cctp_text="Remplacement menuiseries alu école Reims, classement AEV minimum A*3 E*7B V*A2.",
            contraintes_chantier=["bâtiment occupé", "exigences acoustique"],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.methodologie.phases) >= 4
    assert "NF DTU 36.5" in output.methodologie.normes_citees
    assert "NF DTU 44.1" in output.methodologie.normes_citees
    assert "N4" in output.sources_nbk


def test_expert_menuiserie_metadata():
    """Correct Synorix v2.1 metadata."""
    assert ExpertMenuiserie.name == "expert-menuiserie"
    assert ExpertMenuiserie.category == "expert-metier"
    assert ExpertMenuiserie.model == "claude-sonnet-4-6"
    assert ExpertMenuiserie.notebook_sources == ["N4", "N3"]
    assert ExpertMenuiserie.pipeline_step == 3
