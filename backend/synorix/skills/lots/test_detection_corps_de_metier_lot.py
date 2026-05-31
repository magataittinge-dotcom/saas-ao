"""Tests for skill #7 detection-corps-de-metier-lot."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.lots.detection_corps_de_metier_lot import (
    DetectionCorpsDeMetierLot,
    CORPS_VALIDES,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_maps_to_known_corps():
    fake_response = {
        "corps_principal": "ite",
        "libelle_libre": None,
        "corps_secondaires": ["facade"],
        "confidence": 0.9,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionCorpsDeMetierLot()
    output = await skill.run(
        Input(project_id=1, intitule_lot="Lot 3 — Isolation thermique par l'extérieur"),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.corps_principal in CORPS_VALIDES
    assert output.corps_principal == "ite"


@pytest.mark.asyncio
async def test_unknown_corps_uses_libelle_libre():
    fake_response = {
        "corps_principal": "autre",
        "libelle_libre": "Désamiantage",
        "corps_secondaires": [],
        "confidence": 0.4,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionCorpsDeMetierLot()
    output = await skill.run(
        Input(project_id=1, intitule_lot="Lot 9 — Désamiantage"),
        client=client_mock,
    )

    assert output.corps_principal == "autre"
    assert output.libelle_libre == "Désamiantage"


def test_metadata():
    assert DetectionCorpsDeMetierLot.name == "detection-corps-de-metier-lot"
    assert DetectionCorpsDeMetierLot.category == "lots"
    assert DetectionCorpsDeMetierLot.model == "claude-haiku-4-5"
    assert DetectionCorpsDeMetierLot.pipeline_step == 2
