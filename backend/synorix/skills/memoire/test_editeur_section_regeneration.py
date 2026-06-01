"""Tests for skill #58 editeur-section-regeneration."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.editeur_section_regeneration import (
    EditeurSectionRegeneration,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_editeur_regeneration_structure():
    fake_response = {
        "section_regeneree": {
            "titre": "Méthodologie",
            "contenu_markdown": "Version régénérée conservant NF DTU 45.2 et M. Dupont...",
            "longueur_estimee_mots": 900,
        },
        "donnees_socles_preservees": ["NF DTU 45.2", "Qualibat RGE 8632", "M. Dupont"],
        "coherence_check": {"renvois_internes_ok": True, "incoherences": []},
        "champs_a_completer": [],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = EditeurSectionRegeneration()
    output = await skill.run(
        Input(
            project_id=1,
            section_cible="Méthodologie",
            contenu_actuel="...",
            sections_validees=[{"titre": "Préambule"}],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.section_regeneree.titre == "Méthodologie"
    assert len(output.donnees_socles_preservees) >= 1
    assert isinstance(output.coherence_check.renvois_internes_ok, bool)


def test_editeur_regeneration_metadata():
    assert EditeurSectionRegeneration.name == "editeur-section-regeneration"
    assert EditeurSectionRegeneration.category == "memoire"
    assert EditeurSectionRegeneration.model == "claude-opus-4-7"
    assert EditeurSectionRegeneration.notebook_sources == ["N3"]
    assert EditeurSectionRegeneration.pipeline_step == 4
