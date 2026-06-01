"""Tests for skill #62 exporteur-memoire-docx (deterministic, no LLM)."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.exporteur_memoire_docx import (
    ExporteurMemoireDocx,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_export_docx_detecte_depassement_pages():
    """Flags an over-limit document and never calls the LLM."""
    client_mock = AsyncMock()
    skill = ExporteurMemoireDocx()
    output = await skill.run(
        Input(
            project_id=1,
            sections=[{"titre": "Préambule"}, {"titre": "Méthodologie"}],
            limite_pages_rc=12,
            pages_estimees=18,
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    client_mock.complete.assert_not_called()
    assert output.limite_pages_respectee is False
    assert output.alertes
    assert output.charte["gras_strategique"] is True
    assert output.nb_sections == 2


@pytest.mark.asyncio
async def test_export_docx_limite_inconnue_alerte():
    client_mock = AsyncMock()
    skill = ExporteurMemoireDocx()
    output = await skill.run(Input(project_id=1, sections=[]), client=client_mock)
    assert any("À COMPLÉTER" in a for a in output.alertes)


def test_export_docx_metadata():
    assert ExporteurMemoireDocx.name == "exporteur-memoire-docx"
    assert ExporteurMemoireDocx.category == "memoire"
    assert ExporteurMemoireDocx.model == "none"
    assert ExporteurMemoireDocx.notebook_sources == ["N3"]
    assert ExporteurMemoireDocx.pipeline_step == 4
