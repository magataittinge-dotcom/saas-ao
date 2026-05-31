"""Skill #15 — detection-cautionnement-garanties.

Détecte et chiffre les garanties financières exigées (retenue de garantie,
garantie à première demande, caution, GPA, garantie décennale). Sonnet 4.6.

Source : NotebookLM N1 (Réglementaire — CCAG-Travaux 2021).
Raw extract: docs/notebook-extracts/skill-15-detection-cautionnement-garanties-raw.md
System prompt: prompts/detection_cautionnement_garanties.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    rc_text: str = ""
    ccap_text: str | None = None


class Garantie(BaseModel):
    type: str  # retenue_garantie | garantie_premiere_demande | caution | gpa | decennale
    taux_ou_montant: str | None = None
    base_calcul: str | None = None  # "HT" | "TTC"
    modalites: str | None = None
    article_ccag: str | None = None  # ex. "Article 19 CCAG-Travaux 2021"
    document_source: str | None = None


class Output(SkillOutput):
    garanties: list[Garantie]
    confidence: float = Field(ge=0.0, le=1.0)


@register
class DetectionCautionnementGaranties(Skill):
    name = "detection-cautionnement-garanties"
    category = "extraction"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/detection_cautionnement_garanties.md"

    notebook_sources = ["N1"]
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
        ccap = inp.ccap_text or "(non fourni)"
        return f"""## RC
{inp.rc_text}

## CCAP
{ccap}

## Détecte et chiffre les garanties financières en JSON conforme au schéma Output.
"""
