"""Skill #69 — detection-validite-pieces-administratives.

Vérifie que chaque pièce administrative est encore valide à la date de remise
(réutilise la table de validité de #35). Signale expirées et bientôt expirées.

Modèle : Haiku 4.5 (contrôle de dates sur signal fort).
Source : NotebookLM N2 (réutilise #35).
Raw extract: docs/notebook-extracts/skill-69-detection-validite-pieces-administratives-raw.md
System prompt: prompts/detection_validite_pieces_administratives.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    pieces: list[dict] = Field(default_factory=list)  # libelle, date_emission, validite
    date_remise: str


class PieceValidite(BaseModel):
    libelle: str
    date_emission: str
    validite: str
    statut: str  # valide | expiree | bientot_expiree | a_completer


class Output(SkillOutput):
    pieces: list[PieceValidite]
    expirees: list[str] = Field(default_factory=list)
    bientot_expirees: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class DetectionValiditePiecesAdministratives(Skill):
    name = "detection-validite-pieces-administratives"
    category = "verification"
    model = "claude-haiku-4-5"
    version = "1"
    system_prompt_path = "prompts/detection_validite_pieces_administratives.md"

    notebook_sources = ["N2"]
    pipeline_step = 5
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        import json

        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Date de remise : {inp.date_remise}\n\n"
                f"## Pièces administratives\n{json.dumps(inp.pieces, ensure_ascii=False, indent=2)}\n\n"
                "## Contrôle la validité (JSON conforme au schéma Output)."
            ),
            schema=Output,
        )
        return Output.model_validate(raw)
