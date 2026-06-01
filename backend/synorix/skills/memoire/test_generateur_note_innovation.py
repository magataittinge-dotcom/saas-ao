"""Tests for skill #56 generateur-note-innovation."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.generateur_note_innovation import (
    GenerateurNoteInnovation,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_note_innovation_structure():
    fake_response = {
        "note_innovation": {
            "titre": "Note d'innovation",
            "innovations": [
                {
                    "type": "environnementale",
                    "description": "Engins électriques Euro 6",
                    "benefice_chiffre": "-15 dB nuisances, -20% CO2",
                    "justification_technique": "Fiches produits engins",
                    "incidence_financiere": "Surcoût absorbé",
                    "est_variante": False,
                    "rappel_juridique": "",
                },
                {
                    "type": "technique",
                    "description": "Isolant biosourcé alternatif",
                    "benefice_chiffre": "[À COMPLÉTER — donnée à chiffrer]",
                    "justification_technique": "ATec",
                    "incidence_financiere": "À chiffrer",
                    "est_variante": True,
                    "rappel_juridique": "Variante : vérifier le RC, présenter séparément, offre de base obligatoire",
                },
            ],
            "longueur_estimee_mots": 600,
        },
        "gadgets_ecartes": ["Application mobile gadget sans bénéfice mesurable"],
        "champs_a_completer": [],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = GenerateurNoteInnovation()
    output = await skill.run(
        Input(project_id=1, procedure="formalisée", contexte_chantier="école"),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.note_innovation.innovations) >= 1
    # Toute innovation variante porte un rappel juridique
    for inno in output.note_innovation.innovations:
        if inno.est_variante:
            assert inno.rappel_juridique
    assert output.sources_nbk == ["N3"]


def test_note_innovation_metadata():
    assert GenerateurNoteInnovation.name == "generateur-note-innovation"
    assert GenerateurNoteInnovation.category == "memoire"
    assert GenerateurNoteInnovation.model == "claude-opus-4-7"
    assert GenerateurNoteInnovation.notebook_sources == ["N3"]
    assert GenerateurNoteInnovation.pipeline_step == 4
