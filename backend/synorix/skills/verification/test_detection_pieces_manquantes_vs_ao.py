"""Tests for skill #68 detection-pieces-manquantes-vs-ao."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.verification.detection_pieces_manquantes_vs_ao import (
    DetectionPiecesManquantesVsAo,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_pieces_manquantes_structure():
    fake = {
        "pieces": [
            {"exigee": "DC1", "statut": "present", "correspondance": "Lettre de candidature"},
            {"exigee": "Attestation fiscale", "statut": "a_ajouter", "correspondance": ""},
            {"exigee": "Attestation assurance", "statut": "a_verifier", "correspondance": "Assurance ?"},
        ],
        "a_ajouter": ["Attestation fiscale"],
        "a_verifier": ["Attestation assurance"],
        "sources_nbk": ["N2"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = DetectionPiecesManquantesVsAo()
    output = await skill.run(
        Input(project_id=1, pieces_exigees=["DC1", "Attestation fiscale"],
              pieces_dossier=["Lettre de candidature"]),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert "Attestation fiscale" in output.a_ajouter
    assert output.sources_nbk == ["N2"]


def test_pieces_manquantes_metadata():
    assert DetectionPiecesManquantesVsAo.name == "detection-pieces-manquantes-vs-ao"
    assert DetectionPiecesManquantesVsAo.category == "verification"
    assert DetectionPiecesManquantesVsAo.model == "claude-sonnet-4-6"
    assert DetectionPiecesManquantesVsAo.pipeline_step == 5
