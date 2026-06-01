"""Tests for skill #84 recherche-suivi-resultat-ao."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.chatbot.recherche_suivi_resultat_ao import (
    RechercheSuiviResultatAo,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_suivi_resultat_structure():
    fake = {
        "relance_j30": {"message": "Des nouvelles de votre AO ?", "ton": "amical, non intrusif"},
        "analyse_perdu": ["Demander le rapport d'analyse des offres (RAO)", "Capitaliser"],
        "analyse_gagne": ["Respecter le standstill 11 jours", "Préparer le démarrage"],
        "questions_apprentissage": ["Quel critère a fait la différence selon vous ?"],
        "sources_nbk": ["N8"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RechercheSuiviResultatAo()
    output = await skill.run(Input(project_id=1, resultat="perdu"), client=client_mock)

    assert isinstance(output, Output)
    assert any("RAO" in a for a in output.analyse_perdu)
    assert any("standstill" in a.lower() for a in output.analyse_gagne)


def test_suivi_resultat_metadata():
    assert RechercheSuiviResultatAo.name == "recherche-suivi-resultat-ao"
    assert RechercheSuiviResultatAo.category == "chatbot"
    assert RechercheSuiviResultatAo.model == "claude-sonnet-4-6"
    assert RechercheSuiviResultatAo.notebook_sources == ["N8"]
