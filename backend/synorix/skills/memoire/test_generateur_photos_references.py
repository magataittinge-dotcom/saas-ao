"""Tests for skill #52 generateur-photos-references (deterministic, no LLM)."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.generateur_photos_references import (
    GenerateurPhotosReferences,
    Input,
    PhotoInput,
    Output,
)


@pytest.mark.asyncio
async def test_photos_rejette_sans_legende_et_plafonne():
    """A photo without a legend/point technique is rejected; >3 per ref capped."""
    photos = [
        PhotoInput(ref_id="R1", url="a.jpg", legende="Façade nord", point_technique="Pose ITE"),
        PhotoInput(ref_id="R1", url="b.jpg", legende="", point_technique=""),  # rejetée
        PhotoInput(ref_id="R1", url="c.jpg", legende="Détail", point_technique="Calepinage"),
        PhotoInput(ref_id="R1", url="d.jpg", legende="Échafaudage", point_technique="Sécurité"),
        PhotoInput(ref_id="R1", url="e.jpg", legende="EPI", point_technique="Sécurité"),  # 4e -> rejetée
    ]
    client_mock = AsyncMock()

    skill = GenerateurPhotosReferences()
    output = await skill.run(Input(project_id=1, photos=photos), client=client_mock)

    assert isinstance(output, Output)
    # client jamais appelé (déterministe)
    client_mock.complete.assert_not_called()
    # 3 max intégrées pour R1, légendes enrichies du point technique
    assert len(output.photos_integrees) == 3
    assert all(" — " in p.legende for p in output.photos_integrees)
    # b.jpg (sans légende) et e.jpg (4e) rejetées
    assert len(output.photos_rejetees) == 2


def test_photos_metadata():
    assert GenerateurPhotosReferences.name == "generateur-photos-references"
    assert GenerateurPhotosReferences.category == "memoire"
    assert GenerateurPhotosReferences.model == "none"
    assert GenerateurPhotosReferences.notebook_sources == ["N3"]
    assert GenerateurPhotosReferences.pipeline_step == 4
