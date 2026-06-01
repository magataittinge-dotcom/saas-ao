"""Tests for skill #87 detection-criteres-disproportionnes."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.detection_criteres_disproportionnes import (
    DetectionCriteresDisproportionnes,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_criteres_disproportionnes_structure():
    fake = {
        "criteres_disproportionnes": [
            {
                "exigence": "CA minimal de 3 M€ pour un marché estimé à 800 k€",
                "type": "ca",
                "niveau_disproportion": "élevé",
                "fondement": "R2142-6 CCP (plafond 2× le montant estimé)",
                "recommandation": "Contester : CA exigé > 2× le montant estimé",
            }
        ],
        "ratio_ca_constate": "CA exigé ≈ 3,75× le montant estimé",
        "sources_nbk": ["N6"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = DetectionCriteresDisproportionnes()
    output = await skill.run(
        Input(project_id=1, rc_text="CA min 3 M€...", montant_estime=800000.0),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.criteres_disproportionnes
    assert "R2142-6" in output.criteres_disproportionnes[0].fondement


def test_criteres_disproportionnes_metadata():
    assert DetectionCriteresDisproportionnes.name == "detection-criteres-disproportionnes"
    assert DetectionCriteresDisproportionnes.category == "extraction"
    assert DetectionCriteresDisproportionnes.model == "claude-sonnet-4-6"
    assert DetectionCriteresDisproportionnes.pipeline_step == 3
    assert DetectionCriteresDisproportionnes.differentiateur == 10
