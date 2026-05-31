"""Skill #19 — enrichissement-source-document.

Pour chaque exigence extraite, garantit la citation document + numéro de page
exact (page imprimée). Skill technique (mapping offset → page via PyMuPDF en
production ; l'assistant ne fait que normaliser/valider). Haiku 4.5.

<!-- Skill technique, pas d'expertise NotebookLM requise -->
Raw extract: docs/notebook-extracts/skill-19-enrichissement-source-document-raw.md
System prompt: prompts/enrichissement_source_document.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    document: str  # nom du document source
    extrait: str  # texte de l'exigence
    offset_debut: int | None = None
    offset_fin: int | None = None
    page_map: dict[str, int] | None = None  # offset->page si fourni par l'extracteur PDF


class Output(SkillOutput):
    document: str
    page: int | None = None
    offset_debut: int | None = None
    offset_fin: int | None = None
    not_found: bool = False
    confidence: float = Field(ge=0.0, le=1.0)


@register
class EnrichissementSourceDocument(Skill):
    name = "enrichissement-source-document"
    category = "extraction"
    model = "claude-haiku-4-5"
    version = "1"
    system_prompt_path = "prompts/enrichissement_source_document.md"

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
        return f"""## Document
{inp.document}

## Extrait (exigence)
{inp.extrait}

## Offsets
début={inp.offset_debut} fin={inp.offset_fin}

## Mapping offset→page fourni
{inp.page_map or "(non fourni)"}

## Renvoie la citation page exacte en JSON conforme au schéma Output.
"""
