"""Tests for skill #26 expert-ite."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.expert_metier.expert_ite import ExpertITE, Input, Output


@pytest.mark.asyncio
async def test_expert_ite_basic_structure():
    """The skill returns an Output with at least 4 phases and cites CPT 3035."""
    fake_response = {
        "methodologie": {
            "phases": [
                {
                    "nom": "Diagnostic",
                    "description": "...",
                    "normes_appliquees": ["CPT 3035 V3"],
                    "valeurs_chiffrees": {"humidite_max_support_pct": "5"},
                },
                {
                    "nom": "Préparation support",
                    "description": "...",
                    "normes_appliquees": ["CPT 3035 V3"],
                    "valeurs_chiffrees": {},
                },
                {
                    "nom": "Mise en œuvre",
                    "description": "...",
                    "normes_appliquees": ["CPT 3035 V3"],
                    "valeurs_chiffrees": {"plots_par_m2": "12"},
                },
                {
                    "nom": "Contrôles",
                    "description": "...",
                    "normes_appliquees": [],
                    "valeurs_chiffrees": {},
                },
            ],
            "normes_citees": ["CPT 3035 V3", "NF DTU 20.1", "IT 249"],
            "phrases_types": ["..."] * 8,
            "controles_obligatoires": ["..."],
            "livrables_exiges": ["DOE", "Fiches autocontrôle"],
            "points_vigilance": ["Interface menuiseries", "Sécurité incendie"],
        },
        "sources_nbk": ["N4", "N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExpertITE()
    output = await skill.run(
        Input(
            project_id=1,
            cctp_text="Travaux d'ITE sur école de Reims",
            contraintes_chantier=["site occupé"],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.methodologie.phases) >= 4
    assert any("CPT 3035" in n for n in output.methodologie.normes_citees)
    assert "N4" in output.sources_nbk


def test_expert_ite_metadata():
    """The skill exposes correct Synorix v2.1 metadata."""
    assert ExpertITE.name == "expert-ite"
    assert ExpertITE.category == "expert-metier"
    assert ExpertITE.model == "claude-sonnet-4-6"
    assert ExpertITE.notebook_sources == ["N4", "N3"]
    assert ExpertITE.pipeline_step == 3
