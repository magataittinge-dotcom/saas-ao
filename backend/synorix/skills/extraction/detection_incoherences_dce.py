"""Skill #17 — detection-incoherences-dce.

Détecte les incohérences matérielles entre les pièces du DCE (délai RC vs CCAP,
pondérations ≠ 100%, lot manquant, etc.) à partir des outputs des skills #10-#15,
avec suggestion d'action. Sonnet 4.6.

Source : NotebookLM N6 (Pièges/Jurisprudence — divergences inter-pièces).
Raw extract: docs/notebook-extracts/skill-17-detection-incoherences-dce-raw.md
System prompt: prompts/detection_incoherences_dce.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    elements_extraits: str  # synthèse des outputs des skills #10-#15 (faits + sources)


class IncoherenceDce(BaseModel):
    type: str  # "delai_divergent" | "ponderation_total" | "besoin_contradictoire" | …
    pieces_concernees: list[str]  # ex. ["RC", "CCAP"]
    severity: str  # "critical" | "warning" | "info"
    description: str
    action_suggeree: str


class Output(SkillOutput):
    incoherences: list[IncoherenceDce]
    confidence: float = Field(ge=0.0, le=1.0)


@register
class DetectionIncoherencesDce(Skill):
    name = "detection-incoherences-dce"
    category = "extraction"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/detection_incoherences_dce.md"

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
        return f"""## Éléments extraits du DCE (skills #10-#15)
{inp.elements_extraits}

## Détecte les incohérences inter-pièces en JSON conforme au schéma Output.
"""
