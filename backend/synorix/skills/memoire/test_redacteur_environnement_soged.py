"""Tests for skill #47 redacteur-environnement-soged."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.redacteur_environnement_soged import (
    RedacteurEnvironnementSoged,
    Input,
    Output,
)


def _fake(with_soged: bool):
    resp = {
        "section_environnement": {
            "titre": "Démarche environnementale et gestion des déchets",
            "flux_tries": ["bois", "métaux", "plastiques", "inertes", "plâtre"],
            "filieres_tracabilite_markdown": "Bordereaux BSDD, points de collecte agréés...",
            "nuisances_markdown": "Limitation bruit et poussières...",
            "taux_valorisation_cible": "[À COMPLÉTER PAR L'ENTREPRISE]",
            "longueur_estimee_mots": 500,
        },
        "soged": None,
        "champs_a_completer": ["[À COMPLÉTER PAR L'ENTREPRISE] : taux de valorisation"],
        "sources_nbk": ["N3"],
    }
    if with_soged:
        resp["soged"] = {
            "titre": "SOGED",
            "contenu_markdown": "Organisation du tri sur 5 flux...",
            "rep_pmcb_note": "[À COMPLÉTER — REP PMCB à vérifier, hors corpus N3]",
        }
    return resp


@pytest.mark.asyncio
async def test_environnement_5_flux():
    client_mock = AsyncMock()
    client_mock.complete.return_value = _fake(with_soged=False)

    skill = RedacteurEnvironnementSoged()
    output = await skill.run(Input(project_id=1, generer_soged=False), client=client_mock)

    assert isinstance(output, Output)
    for flux in ["bois", "métaux", "plastiques", "inertes", "plâtre"]:
        assert flux in output.section_environnement.flux_tries
    assert output.soged is None


@pytest.mark.asyncio
async def test_soged_when_option_on():
    client_mock = AsyncMock()
    client_mock.complete.return_value = _fake(with_soged=True)

    skill = RedacteurEnvironnementSoged()
    output = await skill.run(Input(project_id=1, generer_soged=True), client=client_mock)

    assert output.soged is not None
    assert "REP PMCB" in output.soged.rep_pmcb_note


def test_environnement_soged_metadata():
    assert RedacteurEnvironnementSoged.name == "redacteur-environnement-soged"
    assert RedacteurEnvironnementSoged.category == "memoire"
    assert RedacteurEnvironnementSoged.model == "claude-sonnet-4-6"
    assert RedacteurEnvironnementSoged.notebook_sources == ["N3"]
    assert RedacteurEnvironnementSoged.pipeline_step == 4
