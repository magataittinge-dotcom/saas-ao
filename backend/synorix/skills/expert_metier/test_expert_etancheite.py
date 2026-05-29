"""Tests for skill #34 expert-etancheite.

⚠ Skill en mode squelette structurel — captures NotebookLM N4/N3 manquantes
au moment de la création (quota Free épuisé). Tests valident la structure
Python et les métadonnées ; le prompt sera complété au prochain accès N4/N3.
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
    """Output structure valide avec ≥ 4 phases et au moins NF DTU 43.1 cité."""
    fake_response = {
        "methodologie": {
            "phases": [
                {
                    "nom": "Préparation & études",
                    "description": "[À COMPLÉTER — capture N4 manquante]",
                    "normes_appliquees": ["NF DTU 43.1"],
                    "valeurs_chiffrees": {},
                },
                {
                    "nom": "Approvisionnement",
                    "description": "[À COMPLÉTER]",
                    "normes_appliquees": ["NF DTU 43.1"],
                    "valeurs_chiffrees": {},
                },
                {
                    "nom": "Mise en œuvre",
                    "description": "[À COMPLÉTER]",
                    "normes_appliquees": ["NF DTU 43.1", "CSFE"],
                    "valeurs_chiffrees": {},
                },
                {
                    "nom": "Contrôles & réception",
                    "description": "[À COMPLÉTER]",
                    "normes_appliquees": ["NF DTU 43.1"],
                    "valeurs_chiffrees": {},
                },
            ],
            "normes_citees": ["NF DTU 43.1", "NF DTU 43.3", "NF DTU 43.4", "NF DTU 43.5", "CSFE"],
            "phrases_types": ["[À COMPLÉTER — capture N3 manquante]"] * 8,
            "controles_obligatoires": ["[À COMPLÉTER]"],
            "livrables_exiges": ["DOE"],
            "points_vigilance": ["[À COMPLÉTER]"],
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
    assert "N4" in output.sources_nbk


def test_expert_etancheite_metadata():
    """Correct Synorix v2.1 metadata (le prompt sera complété ultérieurement)."""
    assert ExpertEtancheite.name == "expert-etancheite"
    assert ExpertEtancheite.category == "expert-metier"
    assert ExpertEtancheite.model == "claude-sonnet-4-6"
    assert ExpertEtancheite.notebook_sources == ["N4", "N3"]
    assert ExpertEtancheite.pipeline_step == 3
