"""Tests for skill #3 detection-doublons-versions."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.upload.detection_doublons_versions import (
    DetectionDoublonsVersions,
    FileRef,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_groups_version_chain():
    """Indice A/B are grouped, B canonical."""
    fake_response = {
        "groups": [
            {
                "canonical_filename": "CCTP_Lot3_IndB.pdf",
                "superseded_filenames": ["CCTP_Lot3_IndA.pdf"],
                "relation": "version",
                "reason": "Indice B > Indice A",
            }
        ],
        "confidence": 0.9,
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionDoublonsVersions()
    output = await skill.run(
        Input(
            project_id=1,
            files=[
                FileRef(filename="CCTP_Lot3_IndA.pdf", sha256="a" * 64),
                FileRef(filename="CCTP_Lot3_IndB.pdf", sha256="b" * 64),
            ],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.groups) == 1
    assert output.groups[0].relation == "version"
    assert output.groups[0].canonical_filename == "CCTP_Lot3_IndB.pdf"


@pytest.mark.asyncio
async def test_no_false_grouping():
    """Distinct lots are not grouped."""
    fake_response = {"groups": [], "confidence": 0.8}
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionDoublonsVersions()
    output = await skill.run(
        Input(
            project_id=1,
            files=[
                FileRef(filename="CCTP_Lot1.pdf"),
                FileRef(filename="CCTP_Lot2.pdf"),
            ],
        ),
        client=client_mock,
    )

    assert output.groups == []


def test_metadata():
    assert DetectionDoublonsVersions.name == "detection-doublons-versions"
    assert DetectionDoublonsVersions.category == "upload"
    assert DetectionDoublonsVersions.model == "claude-haiku-4-5"
    assert DetectionDoublonsVersions.pipeline_step == 1
