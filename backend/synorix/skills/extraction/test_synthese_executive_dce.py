"""Tests for skill #23 synthese-executive-dce."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.synthese_executive_dce import (
    SyntheseExecutiveDce,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_aggregates_key_lines():
    fake_response = {
        "lignes": [
            {"libelle": "Date limite", "valeur": "15/09/2026 12:00", "priorite": 1},
            {"libelle": "Visite obligatoire", "valeur": "Oui — 02/09/2026", "priorite": 2},
            {"libelle": "Pièges détectés", "valeur": "3", "priorite": 5},
        ]
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = SyntheseExecutiveDce()
    output = await skill.run(
        Input(
            project_id=1,
            date_limite="2026-09-15",
            visite_obligatoire=True,
            nb_pieges=3,
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.lignes[0].priorite == 1
    assert len(output.lignes) == 3


def test_metadata():
    assert SyntheseExecutiveDce.name == "synthese-executive-dce"
    assert SyntheseExecutiveDce.category == "extraction"
    assert SyntheseExecutiveDce.model == "claude-sonnet-4-6"
    assert SyntheseExecutiveDce.notebook_sources == []
    assert SyntheseExecutiveDce.pipeline_step == 3
