"""Tests for skill #14 detection-visite-obligatoire-analyse."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.detection_visite_obligatoire_analyse import (
    DetectionVisiteObligatoireAnalyse,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_formats_mandatory_banner():
    fake_response = {
        "afficher": True,
        "niveau": "critique",
        "titre": "Visite de site OBLIGATOIRE",
        "lignes": [
            "Date : 02/09/2026 à 14:00",
            "Lieu : Groupe scolaire Jean Jaurès, Reims",
        ],
        "action": "S'inscrire avant le 31/08/2026",
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionVisiteObligatoireAnalyse()
    output = await skill.run(
        Input(
            project_id=1,
            is_mandatory=True,
            dates=["2026-09-02"],
            heure="14:00",
            lieu="Groupe scolaire Jean Jaurès, Reims",
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.afficher is True
    assert output.niveau == "critique"
    assert output.lignes


def test_metadata():
    assert DetectionVisiteObligatoireAnalyse.name == "detection-visite-obligatoire-analyse"
    assert DetectionVisiteObligatoireAnalyse.category == "extraction"
    assert DetectionVisiteObligatoireAnalyse.model == "claude-sonnet-4-6"
    assert DetectionVisiteObligatoireAnalyse.pipeline_step == 3
