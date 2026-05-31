"""Tests for skill #18 liaison-coffre-fort."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.extraction.liaison_coffre_fort import (
    LiaisonCoffreFort,
    DocumentCoffreFort,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_matches_valid_document():
    fake_response = {
        "statut": "matched_valid",
        "document_id_lie": "doc_123",
        "expiration": "2026-11-30",
        "confidence": 0.95,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = LiaisonCoffreFort()
    output = await skill.run(
        Input(
            project_id=1,
            type_exigence="Attestation vigilance URSSAF de moins de 6 mois",
            coffre_fort=[
                DocumentCoffreFort(
                    document_id="doc_123",
                    titre="Attestation URSSAF",
                    type_detecte="attestation_urssaf",
                    date_expiration="2026-11-30",
                )
            ],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.statut == "matched_valid"
    assert output.document_id_lie == "doc_123"


@pytest.mark.asyncio
async def test_unmatched_when_absent():
    fake_response = {
        "statut": "unmatched",
        "document_id_lie": None,
        "expiration": None,
        "confidence": 0.9,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = LiaisonCoffreFort()
    output = await skill.run(
        Input(project_id=1, type_exigence="Kbis de moins de 3 mois", coffre_fort=[]),
        client=client_mock,
    )

    assert output.statut == "unmatched"
    assert output.document_id_lie is None


def test_metadata():
    assert LiaisonCoffreFort.name == "liaison-coffre-fort"
    assert LiaisonCoffreFort.category == "extraction"
    assert LiaisonCoffreFort.model == "claude-haiku-4-5"
    assert LiaisonCoffreFort.pipeline_step == 3
