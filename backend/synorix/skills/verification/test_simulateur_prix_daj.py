"""Tests for skill #85 simulateur-prix-DAJ (deterministic, no LLM)."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.verification.simulateur_prix_daj import (
    SimulateurPrixDaj,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_daj_formules():
    """Computes the 3 DAJ formulas; lowest bidder scores max on inverse formula."""
    client_mock = AsyncMock()
    skill = SimulateurPrixDaj()
    output = await skill.run(
        Input(project_id=1, prix_candidat=100.0, prix_offres=[100, 120, 140], base=10.0,
              formule_rc="inversement-proportionnelle"),
        client=client_mock,
    )

    assert isinstance(output, Output)
    client_mock.complete.assert_not_called()
    inv = next(n for n in output.notes if n.formule == "inversement-proportionnelle")
    # candidat = prix le plus bas -> note max = base
    assert inv.note == 10.0
    assert output.note_formule_rc == 10.0
    assert {n.formule for n in output.notes} >= {"inversement-proportionnelle", "lineaire", "moyenne"}


def test_daj_metadata():
    assert SimulateurPrixDaj.name == "simulateur-prix-DAJ"
    assert SimulateurPrixDaj.category == "verification"
    assert SimulateurPrixDaj.model == "none"
    assert SimulateurPrixDaj.notebook_sources == ["N7"]
    assert SimulateurPrixDaj.pipeline_step == 5
    assert SimulateurPrixDaj.differentiateur == 6
