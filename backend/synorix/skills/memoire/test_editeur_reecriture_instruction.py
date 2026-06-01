"""Tests for skill #59 editeur-reecriture-instruction."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.editeur_reecriture_instruction import (
    EditeurReecritureInstruction,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_reecriture_instruction_structure():
    fake_response = {
        "paragraphe_reecrit": "En milieu urbain dense, nous limitons les nuisances... (NF DTU 45.2 conservé)",
        "instruction_appliquee": "Accent mis sur l'environnement urbain",
        "faits_preserves": ["NF DTU 45.2", "12 plots/m²"],
        "derive_factuelle_evitee": [],
        "champs_a_completer": [],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = EditeurReecritureInstruction()
    output = await skill.run(
        Input(
            project_id=1,
            paragraphe="Nous posons l'ITE selon NF DTU 45.2 à 12 plots/m².",
            instruction="insiste davantage sur l'environnement urbain",
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.paragraphe_reecrit
    assert "NF DTU 45.2" in output.faits_preserves


def test_reecriture_instruction_metadata():
    assert EditeurReecritureInstruction.name == "editeur-reecriture-instruction"
    assert EditeurReecritureInstruction.category == "memoire"
    assert EditeurReecritureInstruction.model == "claude-opus-4-7"
    assert EditeurReecritureInstruction.notebook_sources == ["N3"]
    assert EditeurReecritureInstruction.pipeline_step == 4
