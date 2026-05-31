"""Tests for skill #4 detection-plateforme-depot."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.upload.detection_plateforme_depot import (
    DetectionPlateformeDepot,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_identifies_place():
    fake_response = {
        "plateforme": "PLACE",
        "url_canonique": "https://www.marches-publics.gouv.fr",
        "libelle_brut": None,
        "source_document": "RC",
        "not_found": False,
        "confidence": 0.95,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionPlateformeDepot()
    output = await skill.run(
        Input(
            project_id=1,
            rc_text="Les plis sont déposés sur la plateforme PLACE (marches-publics.gouv.fr).",
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.plateforme == "PLACE"
    assert output.url_canonique == "https://www.marches-publics.gouv.fr"


@pytest.mark.asyncio
async def test_unknown_platform_no_url():
    """Unknown platform → libelle_brut kept, url_canonique stays null."""
    fake_response = {
        "plateforme": "inconnue",
        "url_canonique": None,
        "libelle_brut": "portail interne ville-X",
        "source_document": "RC",
        "not_found": True,
        "confidence": 0.3,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionPlateformeDepot()
    output = await skill.run(
        Input(project_id=1, rc_text="Dépôt sur le portail interne de la collectivité."),
        client=client_mock,
    )

    assert output.url_canonique is None
    assert output.not_found is True


def test_metadata():
    assert DetectionPlateformeDepot.name == "detection-plateforme-depot"
    assert DetectionPlateformeDepot.category == "upload"
    assert DetectionPlateformeDepot.model == "claude-haiku-4-5"
    assert DetectionPlateformeDepot.notebook_sources == ["N5"]
    assert DetectionPlateformeDepot.pipeline_step == 1
