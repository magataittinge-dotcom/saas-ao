"""Tests for skill #48 redacteur-qualite-paq."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.redacteur_qualite_paq import (
    RedacteurQualitePaq,
    Input,
    Output,
)


def _fake(with_paq: bool):
    resp = {
        "section_qualite": {
            "titre": "Démarche qualité",
            "organisation_markdown": "Responsable qualité, plan de surveillance...",
            "points_arret": ["Validation support avant pose", "Réception enduit"],
            "autocontroles": ["Fiche adhérence", "Fiche calepinage"],
            "gestion_non_conformites_markdown": "Fiche NC, levée des réserves...",
            "indicateurs": ["Autocontrôles quotidiens", "[À COMPLÉTER PAR L'ENTREPRISE] : délai SAV"],
            "longueur_estimee_mots": 550,
        },
        "paq": None,
        "champs_a_completer": [],
        "sources_nbk": ["N3"],
    }
    if with_paq:
        resp["paq"] = {
            "titre": "PAQ / SOPAQ",
            "contenu_markdown": "Organisation qualité détaillée...",
            "structure_imposee_rc": "[À COMPLÉTER — structure SOPAQ imposée par le RC]",
        }
    return resp


@pytest.mark.asyncio
async def test_qualite_points_arret_autocontroles():
    client_mock = AsyncMock()
    client_mock.complete.return_value = _fake(with_paq=False)

    skill = RedacteurQualitePaq()
    output = await skill.run(Input(project_id=1, generer_paq=False), client=client_mock)

    assert isinstance(output, Output)
    assert len(output.section_qualite.points_arret) >= 2
    assert len(output.section_qualite.autocontroles) >= 2
    assert output.paq is None


@pytest.mark.asyncio
async def test_paq_when_option_on():
    client_mock = AsyncMock()
    client_mock.complete.return_value = _fake(with_paq=True)

    skill = RedacteurQualitePaq()
    output = await skill.run(Input(project_id=1, generer_paq=True), client=client_mock)

    assert output.paq is not None


def test_qualite_paq_metadata():
    assert RedacteurQualitePaq.name == "redacteur-qualite-paq"
    assert RedacteurQualitePaq.category == "memoire"
    assert RedacteurQualitePaq.model == "claude-sonnet-4-6"
    assert RedacteurQualitePaq.notebook_sources == ["N3"]
    assert RedacteurQualitePaq.pipeline_step == 4
