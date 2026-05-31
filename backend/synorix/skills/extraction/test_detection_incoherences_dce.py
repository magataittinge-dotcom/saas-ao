"""Tests for skill #17 detection-incoherences-dce."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.detection_incoherences_dce import (
    DetectionIncoherencesDce,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_flags_delai_divergent():
    fake_response = {
        "incoherences": [
            {
                "type": "delai_divergent",
                "pieces_concernees": ["RC", "CCAP"],
                "severity": "critical",
                "description": "Délai 6 mois RC vs 8 mois CCAP.",
                "action_suggeree": "Interroger l'acheteur.",
            }
        ],
        "confidence": 0.88,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionIncoherencesDce()
    output = await skill.run(
        Input(project_id=1, elements_extraits="Délai RC=6 mois ; Délai CCAP=8 mois."),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.incoherences[0].severity == "critical"
    assert "RC" in output.incoherences[0].pieces_concernees
    assert output.incoherences[0].action_suggeree


def test_metadata():
    assert DetectionIncoherencesDce.name == "detection-incoherences-dce"
    assert DetectionIncoherencesDce.category == "extraction"
    assert DetectionIncoherencesDce.model == "claude-sonnet-4-6"
    assert DetectionIncoherencesDce.notebook_sources == ["N6"]
    assert DetectionIncoherencesDce.pipeline_step == 3
