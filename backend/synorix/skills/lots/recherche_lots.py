"""Skill #6 — recherche-lots.

Détecte tous les lots du marché par double source (RC + DPGF), avec un scoring
de confiance interne. Raisonnement multi-documents + réconciliation → Sonnet 4.6.

Source : NotebookLM N8 (Coach/Conseil — allotissement, méthodologies BE).
Raw extract: docs/notebook-extracts/skill-06-recherche-lots-raw.md
System prompt: prompts/recherche_lots.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    rc_text: str
    dpgf_structure: str = ""  # lignes/sections de la DPGF (texte extrait)
    ccap_text: str | None = None


class Lot(BaseModel):
    numero: str  # "1", "3A", "3.2", "2-TO"…
    intitule: str
    source: str  # "RC" | "DPGF" | "RC+DPGF"
    type_lot: str = "standard"  # standard | sous_lot | tranche_ferme | tranche_optionnelle


class Output(SkillOutput):
    lots: list[Lot]
    is_alloti: bool = True
    confidence: float = Field(ge=0.0, le=1.0)  # interne, jamais exposé


@register
class RechercheLots(Skill):
    name = "recherche-lots"
    category = "lots"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/recherche_lots.md"

    notebook_sources = ["N8"]
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
        dpgf = inp.dpgf_structure or "(DPGF non fournie)"
        ccap = inp.ccap_text or "(non fourni)"
        return f"""## Règlement de la Consultation (RC)
{inp.rc_text}

## Structure DPGF
{dpgf}

## CCAP
{ccap}

## Détecte tous les lots (double source RC + DPGF) en JSON conforme au schéma Output.
"""
