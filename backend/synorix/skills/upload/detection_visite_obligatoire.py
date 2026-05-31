"""Skill #5 — detection-visite-obligatoire.

Détecte si la consultation impose une visite obligatoire de site, et extrait
date/heure/lieu/modalités/sanction. Distinction obligatoire vs recommandée +
extraction nuancée → Sonnet 4.6.

Sources : NotebookLM N6 (Pièges/Jurisprudence — irrecevabilité) + N1 (Réglementaire).
Raw extract: docs/notebook-extracts/skill-05-detection-visite-obligatoire-raw.md
System prompt: prompts/detection_visite_obligatoire.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    rc_text: str
    ccap_text: str | None = None


class Output(SkillOutput):
    is_mandatory: bool = False
    dates: list[str] = []  # dates de visite proposées (texte ou ISO)
    heure: str | None = None
    lieu: str | None = None
    modalites_inscription: str | None = None
    sanction: str | None = None  # ex. "offre irrégulière / candidature irrecevable"
    source_document: str | None = None
    source_page: int | None = None
    not_found: bool = False
    confidence: float = Field(ge=0.0, le=1.0)


@register
class DetectionVisiteObligatoire(Skill):
    name = "detection-visite-obligatoire"
    category = "upload"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/detection_visite_obligatoire.md"

    notebook_sources = ["N6", "N1"]
    pipeline_step = 1
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
        ccap = inp.ccap_text or "(non fourni)"
        return f"""## Règlement de la Consultation (RC)
{inp.rc_text}

## CCAP
{ccap}

## Détecte la visite de site (obligatoire/recommandée) en JSON conforme au schéma Output.
"""
