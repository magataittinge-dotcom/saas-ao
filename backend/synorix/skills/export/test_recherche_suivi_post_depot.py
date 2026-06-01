"""Tests for skill #75 recherche-suivi-post-depot."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.export.recherche_suivi_post_depot import (
    RechercheSuiviPostDepot,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_suivi_post_depot_structure():
    fake = {
        "etapes_suivi": [
            {"jalon": "J+1", "action": "Confirmer la bonne réception", "ton": "rassurant"},
            {"jalon": "J+30", "action": "Relance amicale du Coach", "ton": "non intrusif"},
            {"jalon": "J+90", "action": "Archivage", "ton": "neutre"},
        ],
        "scenario_perdu": ["Demander le rapport d'analyse des offres (RAO)", "Capitaliser"],
        "scenario_gagne": ["Respecter le standstill 11 jours", "Préparer le démarrage"],
        "sources_nbk": ["N8"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RechercheSuiviPostDepot()
    output = await skill.run(Input(project_id=1, date_depot="2026-06-15"), client=client_mock)

    assert isinstance(output, Output)
    jalons = [e.jalon for e in output.etapes_suivi]
    assert "J+1" in jalons and "J+90" in jalons
    assert any("RAO" in s for s in output.scenario_perdu)
    assert any("standstill" in s.lower() for s in output.scenario_gagne)


def test_suivi_post_depot_metadata():
    assert RechercheSuiviPostDepot.name == "recherche-suivi-post-depot"
    assert RechercheSuiviPostDepot.category == "export"
    assert RechercheSuiviPostDepot.model == "claude-sonnet-4-6"
    assert RechercheSuiviPostDepot.pipeline_step == 6
