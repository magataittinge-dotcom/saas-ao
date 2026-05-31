"""Skill #9 — detection-incoherences-lots.

Alerte sur les incohérences entre les lots du RC et ceux de la DPGF, en
distinguant matériel (critical) / renommage (warning) / cosmétique (info).
Jugement de matérialité nuancé → Sonnet 4.6.

Source : NotebookLM N6 (Pièges/Jurisprudence — divergences entre pièces).
Raw extract: docs/notebook-extracts/skill-09-detection-incoherences-lots-raw.md
System prompt: prompts/detection_incoherences_lots.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    lots_rc: list[str]  # intitulés/numéros des lots détectés depuis le RC
    lots_dpgf: list[str]  # intitulés/numéros des lots détectés depuis la DPGF


class Incoherence(BaseModel):
    type: str  # "lot_manquant" | "renommage" | "cosmetique" | …
    lot_concerne: str
    severity: str  # "critical" | "warning" | "info"
    description: str
    action_suggeree: str


class Output(SkillOutput):
    incoherences: list[Incoherence]  # vide si aucune
    confidence: float = Field(ge=0.0, le=1.0)


@register
class DetectionIncoherencesLots(Skill):
    name = "detection-incoherences-lots"
    category = "lots"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/detection_incoherences_lots.md"

    notebook_sources = ["N6"]
    pipeline_step = 2
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
        rc = "\n".join(f"- {x}" for x in inp.lots_rc) or "(aucun)"
        dpgf = "\n".join(f"- {x}" for x in inp.lots_dpgf) or "(aucun)"
        return f"""## Lots détectés depuis le RC
{rc}

## Lots détectés depuis la DPGF
{dpgf}

## Détecte les incohérences (matérielles vs cosmétiques) en JSON conforme au schéma Output.
"""
