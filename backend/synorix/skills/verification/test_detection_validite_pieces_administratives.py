"""Tests for skill #69 detection-validite-pieces-administratives."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.verification.detection_validite_pieces_administratives import (
    DetectionValiditePiecesAdministratives,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_validite_pieces_structure():
    fake = {
        "pieces": [
            {"libelle": "Kbis", "date_emission": "2026-01-10", "validite": "3 mois", "statut": "expiree"},
            {"libelle": "Attestation fiscale", "date_emission": "2026-05-01", "validite": "annuelle", "statut": "valide"},
        ],
        "expirees": ["Kbis"],
        "bientot_expirees": [],
        "sources_nbk": ["N2"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = DetectionValiditePiecesAdministratives()
    output = await skill.run(
        Input(project_id=1, date_remise="2026-06-15",
              pieces=[{"libelle": "Kbis", "date_emission": "2026-01-10", "validite": "3 mois"}]),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert "Kbis" in output.expirees


def test_validite_pieces_metadata():
    assert DetectionValiditePiecesAdministratives.name == "detection-validite-pieces-administratives"
    assert DetectionValiditePiecesAdministratives.category == "verification"
    assert DetectionValiditePiecesAdministratives.model == "claude-haiku-4-5"
    assert DetectionValiditePiecesAdministratives.pipeline_step == 5
