"""Tests for skill #20 surlignage-exigence-complete."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.surlignage_exigence_complete import (
    SurlignageExigenceComplete,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_returns_multiline_rectangles():
    fake_response = {
        "rectangles": [
            {"page": 4, "x0": 72.0, "y0": 320.5, "x1": 510.0, "y1": 332.0},
            {"page": 4, "x0": 72.0, "y0": 333.0, "x1": 280.0, "y1": 344.5},
        ],
        "couleur": "orange",
        "not_found": False,
        "confidence": 0.9,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = SurlignageExigenceComplete()
    output = await skill.run(
        Input(project_id=1, phrase="Le titulaire respecte le NF DTU 43.1.", page=4, categorie="technique"),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.rectangles) == 2
    assert output.couleur == "orange"


def test_metadata():
    assert SurlignageExigenceComplete.name == "surlignage-exigence-complete"
    assert SurlignageExigenceComplete.category == "extraction"
    assert SurlignageExigenceComplete.model == "claude-sonnet-4-6"
    assert SurlignageExigenceComplete.notebook_sources == []
    assert SurlignageExigenceComplete.pipeline_step == 3
