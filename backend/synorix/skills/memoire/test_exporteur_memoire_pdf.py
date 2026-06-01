"""Tests for skill #63 exporteur-memoire-pdf (deterministic, no LLM)."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.exporteur_memoire_pdf import (
    ExporteurMemoirePdf,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_export_pdf_nommage_et_signature():
    """Normalises the filename, flags ZIP-only signing, never calls the LLM."""
    client_mock = AsyncMock()
    skill = ExporteurMemoirePdf()
    output = await skill.run(
        Input(
            project_id=1,
            nom_entreprise="Cariso Façade",
            poids_mo=42.0,
            signature_exigee=True,
            depose_en_zip=True,
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    client_mock.complete.assert_not_called()
    assert output.nom_fichier == "Cariso_Façade_Memoire_technique.pdf"
    assert output.poids_respecte is False
    assert output.signature_config["format"] == "PAdES"
    # alerte ZIP + alerte DPI/PDF-A
    assert any("ZIP" in a for a in output.alertes)
    assert any("PDF-A" in a or "DPI" in a for a in output.alertes)


@pytest.mark.asyncio
async def test_export_pdf_poids_ok():
    client_mock = AsyncMock()
    skill = ExporteurMemoirePdf()
    output = await skill.run(
        Input(project_id=1, nom_entreprise="SERI", poids_mo=8.0), client=client_mock
    )
    assert output.poids_respecte is True
    assert output.nom_fichier.startswith("SERI_")


def test_export_pdf_metadata():
    assert ExporteurMemoirePdf.name == "exporteur-memoire-pdf"
    assert ExporteurMemoirePdf.category == "memoire"
    assert ExporteurMemoirePdf.model == "none"
    assert ExporteurMemoirePdf.notebook_sources == ["N5"]
    assert ExporteurMemoirePdf.pipeline_step == 4
