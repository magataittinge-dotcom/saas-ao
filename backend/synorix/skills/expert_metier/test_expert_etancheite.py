"""Tests for skill #34 expert-etancheite.

Recapture complète 2026-05-31 — le prompt est désormais alimenté par NotebookLM
N4 (série NF DTU 43 + 20.12, CSFE) + N3 (mémoires gagnants). version="2".
"""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.expert_metier.expert_etancheite import (
    ExpertEtancheite,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_expert_etancheite_basic_structure():
    """Output structure valide avec ≥ 4 phases et NF DTU 43.1 + 43.11 cités."""
    fake_response = {
        "methodologie": {
            "phases": [
                {
                    "nom": "Préparation & études",
                    "description": "Reconnaissance support, calcul des pentes.",
                    "normes_appliquees": ["NF DTU 43.11", "NF DTU 20.12"],
                    "valeurs_chiffrees": {"pente_min_pct": "1 à 5"},
                },
                {
                    "nom": "Approvisionnement & matériel",
                    "description": "Membranes bitume/synthétiques certifiées.",
                    "normes_appliquees": ["NF DTU 43.1"],
                    "valeurs_chiffrees": {},
                },
                {
                    "nom": "Mise en œuvre",
                    "description": "Pose isolant, membrane, relevés, raccords EP.",
                    "normes_appliquees": ["NF DTU 43.11", "NF DTU 43.1"],
                    "valeurs_chiffrees": {"equerre_renfort_cm": "25"},
                },
                {
                    "nom": "Contrôles & réception",
                    "description": "Mise en eau, PV, DOE.",
                    "normes_appliquees": ["NF DTU 43.11"],
                    "valeurs_chiffrees": {"mise_en_eau_h": "24"},
                },
            ],
            "normes_citees": [
                "NF DTU 43.1",
                "NF DTU 43.11",
                "NF DTU 43.3",
                "NF DTU 43.5",
                "NF DTU 20.12",
                "CSFE",
            ],
            "phrases_types": ["..."] * 10,
            "controles_obligatoires": ["Mise en eau 24h", "Contrôle des relevés"],
            "livrables_exiges": ["DOE", "PAQ", "PV de réception"],
            "points_vigilance": ["Points singuliers", "Évacuations EP"],
        },
        "sources_nbk": ["N4", "N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExpertEtancheite()
    output = await skill.run(
        Input(
            project_id=1,
            cctp_text="Étanchéité toiture-terrasse 800 m² réfection école.",
            contraintes_chantier=["site occupé", "bâtiment R+3"],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.methodologie.phases) >= 4
    assert "NF DTU 43.1" in output.methodologie.normes_citees
    assert "NF DTU 43.11" in output.methodologie.normes_citees
    assert "N4" in output.sources_nbk


def test_expert_etancheite_metadata():
    """Correct Synorix v2.1 metadata, version bumpée à 2 après recapture."""
    assert ExpertEtancheite.name == "expert-etancheite"
    assert ExpertEtancheite.category == "expert-metier"
    assert ExpertEtancheite.model == "claude-sonnet-4-6"
    assert ExpertEtancheite.notebook_sources == ["N4", "N3"]
    assert ExpertEtancheite.pipeline_step == 3
    assert ExpertEtancheite.version == "3"
