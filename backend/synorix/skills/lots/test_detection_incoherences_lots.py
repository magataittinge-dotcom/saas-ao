"""Tests for skill #9 detection-incoherences-lots."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.lots.detection_incoherences_lots import (
    DetectionIncoherencesLots,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_flags_missing_lot_critical():
    fake_response = {
        "incoherences": [
            {
                "type": "lot_manquant",
                "lot_concerne": "Lot 4 — Plomberie",
                "severity": "critical",
                "description": "Lot présent au RC, absent de la DPGF.",
                "action_suggeree": "Interroger l'acheteur sans délai.",
            }
        ],
        "confidence": 0.9,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionIncoherencesLots()
    output = await skill.run(
        Input(
            project_id=1,
            lots_rc=["Lot 1 GO", "Lot 4 Plomberie"],
            lots_dpgf=["Lot 1 GO"],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.incoherences[0].severity == "critical"
    assert output.incoherences[0].action_suggeree


@pytest.mark.asyncio
async def test_no_incoherence():
    fake_response = {"incoherences": [], "confidence": 0.95}
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionIncoherencesLots()
    output = await skill.run(
        Input(project_id=1, lots_rc=["Lot 1 GO"], lots_dpgf=["Lot 1 GO"]),
        client=client_mock,
    )

    assert output.incoherences == []


def test_metadata():
    assert DetectionIncoherencesLots.name == "detection-incoherences-lots"
    assert DetectionIncoherencesLots.category == "lots"
    assert DetectionIncoherencesLots.model == "claude-sonnet-4-6"
    assert DetectionIncoherencesLots.notebook_sources == ["N6"]
    assert DetectionIncoherencesLots.pipeline_step == 2
