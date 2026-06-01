"""Tests for skill #49 redacteur-planning-gantt."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.redacteur_planning_gantt import (
    RedacteurPlanningGantt,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_planning_gantt_structure():
    """Returns a planning section + Gantt with >=3 tasks, intempéries margin,
    and a CCAP coherence verdict."""
    fake_response = {
        "section": {
            "titre": "Planning prévisionnel d'exécution",
            "introduction_markdown": "Planning aligné sur le délai CCAP de 4 mois, marges intempéries...",
            "delai_global": "4 mois",
            "longueur_estimee_mots": 300,
        },
        "gantt": {
            "taches": [
                {"nom": "Installation chantier", "debut_semaine": 0, "duree_semaines": 1, "jalon": False, "annotation": ""},
                {"nom": "Préparation supports", "debut_semaine": 1, "duree_semaines": 2, "jalon": False, "annotation": ""},
                {"nom": "Pose ITE", "debut_semaine": 3, "duree_semaines": 6, "jalon": False, "annotation": "Perçage hors présence élèves"},
                {"nom": "Réception", "debut_semaine": 14, "duree_semaines": 1, "jalon": True, "annotation": ""},
            ],
            "marges_intemperies_semaines": 2,
        },
        "coherence_ccap": {"duree_totale_semaines": 15, "delai_ccap_respecte": True},
        "champs_a_completer": [],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = RedacteurPlanningGantt()
    output = await skill.run(
        Input(
            project_id=1,
            delai_ccap="4 mois",
            phases_execution=["Préparation", "Pose ITE", "Réception"],
            contraintes_rc=["site scolaire occupé"],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.gantt is not None
    assert len(output.gantt.taches) >= 3
    assert output.gantt.marges_intemperies_semaines >= 1
    assert isinstance(output.coherence_ccap.delai_ccap_respecte, bool)


def test_planning_gantt_metadata():
    assert RedacteurPlanningGantt.name == "redacteur-planning-gantt"
    assert RedacteurPlanningGantt.category == "memoire"
    assert RedacteurPlanningGantt.model == "claude-sonnet-4-6"
    assert RedacteurPlanningGantt.notebook_sources == ["N3"]
    assert RedacteurPlanningGantt.pipeline_step == 4
