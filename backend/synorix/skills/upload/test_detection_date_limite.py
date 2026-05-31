"""Tests for skill #2 detection-date-limite."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.upload.detection_date_limite import (
    DetectionDateLimite,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_extracts_date_from_rc():
    """A clear RC date is extracted with its source document."""
    fake_response = {
        "date_limite": "2026-09-15",
        "heure_limite": "12:00",
        "fuseau": "Europe/Paris",
        "source_document": "RC",
        "source_page": 1,
        "divergence": None,
        "not_found": False,
        "confidence": 0.97,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionDateLimite()
    output = await skill.run(
        Input(
            project_id=1,
            rc_text="Date et heure limites de réception des plis : le 15/09/2026 à 12:00 (heure de Paris).",
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.date_limite == "2026-09-15"
    assert output.source_document == "RC"
    assert output.not_found is False


@pytest.mark.asyncio
async def test_missing_date_returns_not_found():
    """No extractable date → not_found, never an invented value."""
    fake_response = {
        "date_limite": None,
        "heure_limite": None,
        "fuseau": "Europe/Paris",
        "source_document": None,
        "source_page": None,
        "divergence": None,
        "not_found": True,
        "confidence": 0.1,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionDateLimite()
    output = await skill.run(
        Input(project_id=1, rc_text="Document sans date limite identifiable."),
        client=client_mock,
    )

    assert output.not_found is True
    assert output.date_limite is None


def test_metadata():
    assert DetectionDateLimite.name == "detection-date-limite"
    assert DetectionDateLimite.category == "upload"
    assert DetectionDateLimite.model == "claude-sonnet-4-6"
    assert DetectionDateLimite.notebook_sources == ["N2", "N1"]
    assert DetectionDateLimite.pipeline_step == 1
