"""Tests for skill #44 redacteur-presentation-prestation."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.redacteur_presentation_prestation import (
    RedacteurPresentationPrestation,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_redacteur_presentation_prestation_structure():
    """Returns PARTIE B with >=2 Contraintes=Solutions and >=1 aléa."""
    fake_response = {
        "section": {
            "titre": "PARTIE B — Présentation de la prestation",
            "comprehension_besoin_markdown": (
                "La rénovation thermique de l'école implique une interface forte "
                "avec le lot menuiseries extérieures..."
            ),
            "contraintes_solutions": [
                {
                    "contrainte": "Sécurité des 300 élèves pendant les livraisons",
                    "solution": "Livraisons interdites 8h00-8h45 et 16h00-16h45, balisage zone X",
                    "type": "site",
                },
                {
                    "contrainte": "Remontées capillaires avant ITE",
                    "solution": "Traitement préalable et diagnostic d'humidité",
                    "type": "technique",
                },
            ],
            "anticipation_aleas": [
                {
                    "risque": "Enduit ITE par temps de pluie",
                    "solution_repli": "Report enduisage, bâchage, marge planning",
                }
            ],
            "longueur_estimee_mots": 1100,
        },
        "champs_a_completer": [],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = RedacteurPresentationPrestation()
    output = await skill.run(
        Input(
            project_id=1,
            cctp_text="Travaux ITE école, site occupé...",
            donnees_ao={"nom_chantier": "École Reims", "lot": "ITE"},
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.section.contraintes_solutions) >= 2
    assert len(output.section.anticipation_aleas) >= 1
    assert output.sources_nbk == ["N3"]


def test_redacteur_presentation_prestation_metadata():
    assert RedacteurPresentationPrestation.name == "redacteur-presentation-prestation"
    assert RedacteurPresentationPrestation.category == "memoire"
    assert RedacteurPresentationPrestation.model == "claude-opus-4-7"
    assert RedacteurPresentationPrestation.notebook_sources == ["N3"]
    assert RedacteurPresentationPrestation.pipeline_step == 4
