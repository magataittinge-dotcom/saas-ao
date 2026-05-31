"""Skill #8 — extraction-description-lot.

Extrait la description synthétique d'un lot depuis son CCTP (objet, consistance,
prestations clés, montant si présent). Extraction fidèle avec source → Sonnet 4.6.

Source : NotebookLM N4 (structure CCTP, fascicules CCTG).
Raw extract: docs/notebook-extracts/skill-08-extraction-description-lot-raw.md
System prompt: prompts/extraction_description_lot.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    intitule_lot: str
    cctp_text: str


class Output(SkillOutput):
    description: str  # 3-5 phrases, fidèle au CCTP
    prestations_principales: list[str] = []
    prestations_accessoires: list[str] = []
    montant_estime: str | None = None  # uniquement si présent dans le CCTP
    source_document: str | None = None
    not_found: bool = False
    confidence: float = Field(ge=0.0, le=1.0)


@register
class ExtractionDescriptionLot(Skill):
    name = "extraction-description-lot"
    category = "lots"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/extraction_description_lot.md"

    notebook_sources = ["N4"]
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
        return f"""## Intitulé du lot
{inp.intitule_lot}

## CCTP du lot
{inp.cctp_text}

## Extrais la description synthétique du lot en JSON conforme au schéma Output.
"""
