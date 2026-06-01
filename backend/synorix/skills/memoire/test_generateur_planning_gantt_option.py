"""Tests for skill #51 generateur-planning-gantt-option."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.generateur_planning_gantt_option import (
    GenerateurPlanningGanttOption,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_gantt_annexe_structure():
    fake_response = {
        "annexe": {
            "titre": "Annexe — Planning prévisionnel",
            "chapeau_markdown": "Planning aligné sur le délai CCAP...",
            "legende": ["Jalon = losange", "Marge intempéries = hachuré"],
        },
        "gantt": {
            "taches": [
                {"nom": "Installation", "debut_semaine": 0, "duree_semaines": 1, "jalon": False, "annotation": ""},
                {"nom": "Pose", "debut_semaine": 1, "duree_semaines": 6, "jalon": False, "annotation": ""},
                {"nom": "Réception", "debut_semaine": 8, "duree_semaines": 1, "jalon": True, "annotation": ""},
            ],
            "marges_intemperies_semaines": 1,
        },
        "coherence_ccap": {"duree_totale_semaines": 9, "delai_ccap_respecte": True},
        "champs_a_completer": [],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = GenerateurPlanningGanttOption()
    output = await skill.run(
        Input(project_id=1, delai_ccap="3 mois", phases_execution=["Pose"]),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.gantt.taches) >= 3
    assert "Annexe" in output.annexe.titre
    assert output.gantt.marges_intemperies_semaines >= 1


def test_gantt_annexe_metadata():
    assert GenerateurPlanningGanttOption.name == "generateur-planning-gantt-option"
    assert GenerateurPlanningGanttOption.category == "memoire"
    assert GenerateurPlanningGanttOption.model == "claude-sonnet-4-6"
    assert GenerateurPlanningGanttOption.notebook_sources == ["N3"]
    assert GenerateurPlanningGanttOption.pipeline_step == 4
