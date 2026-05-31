"""Skill #20 — surlignage-exigence-complete.

Au clic sur la source d'une exigence, calcule les rectangles de surlignage
couvrant la PHRASE COMPLÈTE dans le PDF (ruptures de ligne, césures, colonnes).
Skill technique (PyMuPDF search_for / get_text("dict") en production). Sonnet 4.6.

<!-- Skill technique, pas d'expertise NotebookLM requise -->
Raw extract: docs/notebook-extracts/skill-20-surlignage-exigence-complete-raw.md
System prompt: prompts/surlignage_exigence_complete.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Rect(BaseModel):
    page: int
    x0: float
    y0: float
    x1: float
    y1: float


class Input(SkillInput):
    phrase: str  # phrase complète à surligner
    page: int
    categorie: str = "info"  # bleu/orange/vert/rouge selon catégorie
    text_blocks: list[dict] | None = None  # blocs PyMuPDF (texte + bbox) si fournis


class Output(SkillOutput):
    rectangles: list[Rect]
    couleur: str  # code couleur selon catégorie
    not_found: bool = False
    confidence: float = Field(ge=0.0, le=1.0)


@register
class SurlignageExigenceComplete(Skill):
    name = "surlignage-exigence-complete"
    category = "extraction"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/surlignage_exigence_complete.md"

    notebook_sources = []  # skill technique
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
        return f"""## Phrase à surligner (page {inp.page}, catégorie {inp.categorie})
{inp.phrase}

## Blocs de texte PDF (bbox) fournis
{inp.text_blocks or "(non fournis)"}

## Renvoie les rectangles couvrant la phrase complète en JSON conforme au schéma Output.
"""
