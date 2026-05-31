"""Tests for skill #16 detection-pieges-dce."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.detection_pieges_dce import (
    DetectionPiegesDce,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_flags_prix_ferme_extreme():
    fake_response = {
        "pieges": [
            {
                "type": "prix_ferme",
                "gravite": "extreme",
                "description": "Pas de révision de prix.",
                "formulation_type": "Les prix sont fermes et invariables pendant toute la durée.",
                "document_source": "CCAP",
            }
        ],
        "confidence": 0.9,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionPiegesDce()
    output = await skill.run(
        Input(project_id=1, dce_text="Les prix sont fermes et invariables pendant toute la durée."),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.pieges[0].gravite == "extreme"
    assert output.pieges[0].formulation_type


@pytest.mark.asyncio
async def test_no_piege():
    fake_response = {"pieges": [], "confidence": 0.7}
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionPiegesDce()
    output = await skill.run(Input(project_id=1, dce_text="Marché standard sans clause atypique."), client=client_mock)
    assert output.pieges == []


def test_metadata():
    assert DetectionPiegesDce.name == "detection-pieges-dce"
    assert DetectionPiegesDce.category == "extraction"
    assert DetectionPiegesDce.model == "claude-sonnet-4-6"
    assert DetectionPiegesDce.notebook_sources == ["N6"]
    assert DetectionPiegesDce.pipeline_step == 3
