"""Tests for skill #42 redacteur-equipe-dediee."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.redacteur_equipe_dediee import (
    RedacteurEquipeDediee,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_redacteur_equipe_dediee_structure():
    """Returns synthetic CVs with a firm-affectation intro."""
    fake_response = {
        "section": {
            "titre": "Équipe dédiée au chantier",
            "introduction_markdown": (
                "Nous affectons fermement à ce chantier l'équipe nominative suivante..."
            ),
            "cv_membres": [
                {
                    "role": "Chef de chantier",
                    "nom": "[À COMPLÉTER PAR L'ENTREPRISE — nom]",
                    "anciennete": "12 ans dont 8 dans l'entreprise",
                    "track_record": ["École Reims 2024", "Collège Châlons 2023"],
                    "habilitations": ["CACES", "Travail en hauteur", "SST"],
                }
            ],
            "longueur_estimee_mots": 380,
        },
        "champs_a_completer": ["[À COMPLÉTER PAR L'ENTREPRISE — nom] : chef de chantier"],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = RedacteurEquipeDediee()
    output = await skill.run(
        Input(
            project_id=1,
            equipe_moyens={"chef_chantier": {}},
            profil_ao={"type": "école site occupé"},
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.section.cv_membres) >= 1
    assert "affect" in output.section.introduction_markdown.lower()
    assert output.sources_nbk == ["N3"]


def test_redacteur_equipe_dediee_metadata():
    assert RedacteurEquipeDediee.name == "redacteur-equipe-dediee"
    assert RedacteurEquipeDediee.category == "memoire"
    assert RedacteurEquipeDediee.model == "claude-sonnet-4-6"
    assert RedacteurEquipeDediee.notebook_sources == ["N3"]
    assert RedacteurEquipeDediee.pipeline_step == 4
