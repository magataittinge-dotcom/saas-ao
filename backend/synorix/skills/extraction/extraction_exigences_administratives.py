"""Skill #10 — extraction-exigences-administratives.

Extrait toutes les exigences administratives (pièces de candidature) du DCE,
avec source page. Extraction structurée avec citation → Sonnet 4.6.

Source : NotebookLM N2 (Pièces administratives BTP).
Raw extract: docs/notebook-extracts/skill-10-extraction-exigences-administratives-raw.md
System prompt: prompts/extraction_exigences_administratives.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    rc_text: str = ""
    ccap_text: str | None = None
    ae_text: str | None = None


class ExigenceAdmin(BaseModel):
    type_piece: str  # ex. "Attestation vigilance URSSAF"
    description: str
    validite_requise: str | None = None  # ex. "moins de 6 mois"
    document_source: str  # ex. "RC"
    page_source: int | None = None
    categorie: str = "admin"


class Output(SkillOutput):
    exigences: list[ExigenceAdmin]
    confidence: float = Field(ge=0.0, le=1.0)


@register
class ExtractionExigencesAdministratives(Skill):
    name = "extraction-exigences-administratives"
    category = "extraction"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/extraction_exigences_administratives.md"

    notebook_sources = ["N2"]
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
        ae = inp.ae_text or "(non fourni)"
        return f"""## RC
{inp.rc_text}

## CCAP
{ccap}

## AE
{ae}

## Extrais les exigences administratives en JSON conforme au schéma Output.
"""
