"""Tests for skill #6 recherche-lots."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.lots.recherche_lots import RechercheLots, Input, Output


@pytest.mark.asyncio
async def test_detects_lots_double_source():
    fake_response = {
        "lots": [
            {"numero": "1", "intitule": "Gros œuvre", "source": "RC+DPGF", "type_lot": "standard"},
            {"numero": "3A", "intitule": "Façade Nord", "source": "DPGF", "type_lot": "sous_lot"},
        ],
        "is_alloti": True,
        "confidence": 0.92,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = RechercheLots()
    output = await skill.run(
        Input(
            project_id=1,
            rc_text="Lot 1 Gros œuvre ; Lot 3 Façade.",
            dpgf_structure="Lot 1 Gros œuvre ; Lot 3A Façade Nord.",
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.lots) == 2
    assert output.lots[0].source == "RC+DPGF"
    assert output.lots[1].type_lot == "sous_lot"


def test_metadata():
    assert RechercheLots.name == "recherche-lots"
    assert RechercheLots.category == "lots"
    assert RechercheLots.model == "claude-sonnet-4-6"
    assert RechercheLots.notebook_sources == ["N8"]
    assert RechercheLots.pipeline_step == 2
