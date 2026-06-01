"""Tests for skill #54 generateur-soged."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.generateur_soged import GenerateurSoged, Input, Output


@pytest.mark.asyncio
async def test_generateur_soged_structure():
    fake_response = {
        "soged": {
            "titre": "SOGED — École Reims",
            "flux_tries": ["bois", "métaux", "plastiques", "inertes", "plâtre"],
            "filieres_markdown": "Points de collecte agréés...",
            "tracabilite_markdown": "Bordereaux BSDD...",
            "taux_valorisation_cible": "[À COMPLÉTER PAR L'ENTREPRISE]",
            "rep_pmcb_note": "[À COMPLÉTER — REP PMCB à vérifier, hors corpus N3]",
            "longueur_estimee_mots": 700,
        },
        "champs_a_completer": ["taux de valorisation"],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = GenerateurSoged()
    output = await skill.run(Input(project_id=1), client=client_mock)

    assert isinstance(output, Output)
    for flux in ["bois", "métaux", "plastiques", "inertes", "plâtre"]:
        assert flux in output.soged.flux_tries
    assert "REP PMCB" in output.soged.rep_pmcb_note


def test_generateur_soged_metadata():
    assert GenerateurSoged.name == "generateur-soged"
    assert GenerateurSoged.category == "memoire"
    assert GenerateurSoged.model == "claude-sonnet-4-6"
    assert GenerateurSoged.notebook_sources == ["N3"]
    assert GenerateurSoged.pipeline_step == 4
