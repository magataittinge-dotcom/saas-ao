"""Tests for skill #55 generateur-paq."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.generateur_paq import GenerateurPaq, Input, Output


@pytest.mark.asyncio
async def test_generateur_paq_structure():
    fake_response = {
        "paq": {
            "titre": "PAQ — École Reims",
            "organisation_markdown": "Responsable qualité...",
            "points_arret": ["Validation support", "Réception enduit"],
            "autocontroles": ["Fiche adhérence", "Fiche calepinage"],
            "plan_surveillance_markdown": "Fréquences de contrôle...",
            "gestion_non_conformites_markdown": "Fiche NC, traitement...",
            "indicateurs_quantifies": ["Autocontrôles quotidiens", "[À COMPLÉTER PAR L'ENTREPRISE] : délai SAV"],
            "structure_imposee_rc": "[À COMPLÉTER — structure SOPAQ imposée par le RC]",
            "longueur_estimee_mots": 900,
        },
        "champs_a_completer": [],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = GenerateurPaq()
    output = await skill.run(Input(project_id=1), client=client_mock)

    assert isinstance(output, Output)
    assert len(output.paq.points_arret) >= 2
    assert len(output.paq.autocontroles) >= 2
    assert len(output.paq.indicateurs_quantifies) >= 1


def test_generateur_paq_metadata():
    assert GenerateurPaq.name == "generateur-paq"
    assert GenerateurPaq.category == "memoire"
    assert GenerateurPaq.model == "claude-sonnet-4-6"
    assert GenerateurPaq.notebook_sources == ["N3"]
    assert GenerateurPaq.pipeline_step == 4
