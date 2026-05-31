"""Tests for skill #35 validation-piece-coffre-fort."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.validation_piece_coffre_fort import (
    ValidationPieceCoffreFort,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_warns_if_expires_before_deadline():
    fake_response = {
        "is_valid": False,
        "expires_at": "2026-09-01",
        "warning": "expire avant la remise",
        "confidence": 0.95,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ValidationPieceCoffreFort()
    output = await skill.run(
        Input(
            project_id=1,
            type_piece="Attestation URSSAF",
            date_emission="2026-03-01",
            date_limite_remise="2026-09-15",
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.is_valid is False
    assert output.warning == "expire avant la remise"


def test_metadata():
    assert ValidationPieceCoffreFort.name == "validation-piece-coffre-fort"
    assert ValidationPieceCoffreFort.category == "extraction"
    assert ValidationPieceCoffreFort.model == "claude-haiku-4-5"
    assert ValidationPieceCoffreFort.notebook_sources == ["N2"]
    assert ValidationPieceCoffreFort.pipeline_step == 3
