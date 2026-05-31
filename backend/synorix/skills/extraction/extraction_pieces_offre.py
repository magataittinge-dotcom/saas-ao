"""Skill #11 — extraction-pieces-offre.

Extrait les pièces constitutives de l'offre (AE signé, DPGF/BPU complétés,
mémoire technique, planning, organigramme…), distinctes des pièces de candidature.
Sonnet 4.6.

Source : NotebookLM N2 (Pièces administratives BTP — distinction candidature/offre).
Raw extract: docs/notebook-extracts/skill-11-extraction-pieces-offre-raw.md
System prompt: prompts/extraction_pieces_offre.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    rc_text: str = ""
    ccap_text: str | None = None
    ae_text: str | None = None


class PieceOffre(BaseModel):
    nom_piece: str
    description: str
    format_attendu: str | None = None  # ".pdf", ".xlsx", "électronique"…
    page_source: int | None = None
    document_source: str | None = None
    categorie: str = "offre"


class Output(SkillOutput):
    pieces: list[PieceOffre]
    confidence: float = Field(ge=0.0, le=1.0)


@register
class ExtractionPiecesOffre(Skill):
    name = "extraction-pieces-offre"
    category = "extraction"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/extraction_pieces_offre.md"

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

## Extrais les pièces de l'OFFRE (distinctes des pièces de candidature) en JSON conforme au schéma Output.
"""
