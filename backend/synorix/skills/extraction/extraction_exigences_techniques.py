"""Skill #12 — extraction-exigences-techniques.

Extrait les exigences techniques du CCTP (normes/DTU, certifications produit,
performances chiffrées, méthodologie, qualifications, échéances) avec source.
Sonnet 4.6.

Source : NotebookLM N4 (Normes DTU / exigences CCTP).
Raw extract: docs/notebook-extracts/skill-12-extraction-exigences-techniques-raw.md
System prompt: prompts/extraction_exigences_techniques.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    cctp_text: str


class ExigenceTechnique(BaseModel):
    type: str  # norme | certification | performance | methodologie | qualification | echeance
    libelle: str
    reference_norme: str | None = None  # ex. "NF DTU 20.1"
    valeur_seuil: str | None = None  # ex. ">= 10^-3 m/s", "<= 5 mm sous règle 2 m"
    page_source: int | None = None


class Output(SkillOutput):
    exigences: list[ExigenceTechnique]
    confidence: float = Field(ge=0.0, le=1.0)


@register
class ExtractionExigencesTechniques(Skill):
    name = "extraction-exigences-techniques"
    category = "extraction"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/extraction_exigences_techniques.md"

    notebook_sources = ["N4"]
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
        return f"""## CCTP du lot
{inp.cctp_text}

## Extrais les exigences techniques classées par type en JSON conforme au schéma Output.
"""
