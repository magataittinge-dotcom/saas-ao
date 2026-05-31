"""Skill #13 — extraction-criteres-jugement.

Extrait les critères de jugement des offres, leurs pondérations exactes, les
sous-critères, et la formule de notation du prix. Sonnet 4.6.

Source : NotebookLM N7 (Scoring / Évaluation — formules DAJ).
Raw extract: docs/notebook-extracts/skill-13-extraction-criteres-jugement-raw.md
System prompt: prompts/extraction_criteres_jugement.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    rc_text: str


class SousCritere(BaseModel):
    nom: str
    ponderation: str | None = None


class Critere(BaseModel):
    critere: str
    ponderation: str | None = None  # ex. "40%", "50 points"
    sous_criteres: list[SousCritere] = []


class Output(SkillOutput):
    criteres: list[Critere]
    formule_prix: str | None = None  # type de formule + expression si donnée
    ponderations_explicites: bool = True
    source_page: int | None = None
    not_found: bool = False
    confidence: float = Field(ge=0.0, le=1.0)


@register
class ExtractionCriteresJugement(Skill):
    name = "extraction-criteres-jugement"
    category = "extraction"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/extraction_criteres_jugement.md"

    notebook_sources = ["N7"]
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
        return f"""## RC
{inp.rc_text}

## Extrais les critères de jugement, pondérations et formule de prix en JSON conforme au schéma Output.
"""
