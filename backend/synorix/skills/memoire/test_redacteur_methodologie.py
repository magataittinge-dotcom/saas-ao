"""Tests for skill #45 redacteur-methodologie."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.redacteur_methodologie import (
    RedacteurMethodologie,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_redacteur_methodologie_structure():
    """Returns PARTIE C with >=3 chronological phases, each citing norms and
    autocontrôles."""
    fake_response = {
        "section": {
            "titre": "PARTIE C — Méthodologie d'exécution",
            "phases": [
                {
                    "nom": "Phase 1 — Préparation & reconnaissance du support",
                    "mode_operatoire_markdown": "Tests d'arrachement in situ...",
                    "normes_citees": ["NF DTU 45.2"],
                    "points_singuliers": ["Embrasures", "Soubassements"],
                    "autocontroles": ["Fiche d'autocontrôle adhérence"],
                    "benefice_acheteur": "Pérennité de l'ouvrage",
                },
                {
                    "nom": "Phase 2 — Mise en œuvre",
                    "mode_operatoire_markdown": "Pose du complexe isolant...",
                    "normes_citees": ["NF DTU 45.2"],
                    "points_singuliers": ["Calepinage sans vide"],
                    "autocontroles": ["Contrôle calepinage"],
                    "benefice_acheteur": "Qualité thermique",
                },
                {
                    "nom": "Phase 3 — Contrôles & réception",
                    "mode_operatoire_markdown": "Contrôle visuel à 2 m...",
                    "normes_citees": [],
                    "points_singuliers": [],
                    "autocontroles": ["PV de réception"],
                    "benefice_acheteur": "Livraison conforme",
                },
            ],
            "longueur_estimee_mots": 1800,
        },
        "champs_a_completer": [],
        "sources_nbk": ["N3", "N4"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = RedacteurMethodologie()
    output = await skill.run(
        Input(
            project_id=1,
            cctp_text="Travaux ITE collège...",
            corps_de_metier="ITE",
            methodologie_expert={"phases": []},
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.section.phases) >= 3
    assert all(len(p.autocontroles) >= 1 for p in output.section.phases)
    assert any("NF DTU 45.2" in p.normes_citees for p in output.section.phases)
    assert output.sources_nbk == ["N3", "N4"]


def test_redacteur_methodologie_metadata():
    assert RedacteurMethodologie.name == "redacteur-methodologie"
    assert RedacteurMethodologie.category == "memoire"
    assert RedacteurMethodologie.model == "claude-opus-4-7"
    assert RedacteurMethodologie.notebook_sources == ["N3", "N4"]
    assert RedacteurMethodologie.pipeline_step == 4
