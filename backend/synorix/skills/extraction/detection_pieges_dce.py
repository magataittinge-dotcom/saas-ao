"""Skill #16 — detection-pieges-dce.

Détecte les pièges classiques d'un DCE (clauses à risque pour le candidat),
classés par gravité, chaque alerte étayée par sa formulation-type. Sonnet 4.6.

Source : NotebookLM N6 (Pièges/Jurisprudence).
Raw extract: docs/notebook-extracts/skill-16-detection-pieges-dce-raw.md
System prompt: prompts/detection_pieges_dce.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    dce_text: str  # texte agrégé des pièces (RC, CCAP, CCTP…)


class Piege(BaseModel):
    type: str  # ex. "prix_ferme", "penalites_non_plafonnees"
    gravite: str  # "extreme" | "forte" | "moderee"
    description: str
    formulation_type: str  # extrait/marqueur ayant déclenché l'alerte
    document_source: str | None = None


class Output(SkillOutput):
    pieges: list[Piege]  # vide si aucun
    confidence: float = Field(ge=0.0, le=1.0)


@register
class DetectionPiegesDce(Skill):
    name = "detection-pieges-dce"
    category = "extraction"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/detection_pieges_dce.md"

    notebook_sources = ["N6"]
    pipeline_step = 3
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        user_prompt = self._build_user_prompt(inp)
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=user_prompt,
            schema=Output,
        )
        return Output.model_validate(raw)

    def _build_user_prompt(self, inp: Input) -> str:
        return f"""## Texte du DCE
{inp.dce_text}

## Détecte les pièges (étayés par leur formulation) en JSON conforme au schéma Output.
"""
