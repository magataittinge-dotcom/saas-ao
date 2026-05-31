"""Tests for skill #5 detection-visite-obligatoire."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.upload.detection_visite_obligatoire import (
    DetectionVisiteObligatoire,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_detects_mandatory_visit():
    fake_response = {
        "is_mandatory": True,
        "dates": ["2026-09-02"],
        "heure": "14:00",
        "lieu": "Groupe scolaire Jean Jaurès, Reims",
        "modalites_inscription": "Inscription par mail 48h avant",
        "sanction": "Offre déclarée irrégulière sans attestation de visite",
        "source_document": "RC",
        "source_page": 5,
        "not_found": False,
        "confidence": 0.93,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionVisiteObligatoire()
    output = await skill.run(
        Input(
            project_id=1,
            rc_text="Le candidat doit effectuer une visite obligatoire ; attestation à joindre.",
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.is_mandatory is True
    assert output.sanction is not None


@pytest.mark.asyncio
async def test_no_visit():
    fake_response = {
        "is_mandatory": False,
        "dates": [],
        "heure": None,
        "lieu": None,
        "modalites_inscription": None,
        "sanction": None,
        "source_document": None,
        "source_page": None,
        "not_found": True,
        "confidence": 0.6,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionVisiteObligatoire()
    output = await skill.run(
        Input(project_id=1, rc_text="Aucune visite de site n'est prévue."),
        client=client_mock,
    )

    assert output.is_mandatory is False
    assert output.not_found is True


def test_metadata():
    assert DetectionVisiteObligatoire.name == "detection-visite-obligatoire"
    assert DetectionVisiteObligatoire.category == "upload"
    assert DetectionVisiteObligatoire.model == "claude-sonnet-4-6"
    assert DetectionVisiteObligatoire.notebook_sources == ["N6", "N1"]
    assert DetectionVisiteObligatoire.pipeline_step == 1
