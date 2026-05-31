"""Tests for skill #15 detection-cautionnement-garanties."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.detection_cautionnement_garanties import (
    DetectionCautionnementGaranties,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_detects_retenue_garantie():
    fake_response = {
        "garanties": [
            {
                "type": "retenue_garantie",
                "taux_ou_montant": "5 %",
                "base_calcul": None,
                "modalites": "Libérée 1 an après réception ; substituable par caution.",
                "article_ccag": "Article 19 CCAG-Travaux 2021",
                "document_source": "CCAP",
            }
        ],
        "confidence": 0.9,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionCautionnementGaranties()
    output = await skill.run(
        Input(project_id=1, ccap_text="Une retenue de garantie de 5% est prélevée sur les acomptes."),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.garanties[0].type == "retenue_garantie"
    assert output.garanties[0].taux_ou_montant == "5 %"
    assert "Article 19" in output.garanties[0].article_ccag


def test_metadata():
    assert DetectionCautionnementGaranties.name == "detection-cautionnement-garanties"
    assert DetectionCautionnementGaranties.category == "extraction"
    assert DetectionCautionnementGaranties.model == "claude-sonnet-4-6"
    assert DetectionCautionnementGaranties.notebook_sources == ["N1"]
    assert DetectionCautionnementGaranties.pipeline_step == 3
