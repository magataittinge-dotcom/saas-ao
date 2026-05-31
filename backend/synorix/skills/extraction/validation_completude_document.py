"""Skill #22 — validation-completude-document.

Pour un document édité dans Synorix (DPGF, Cerfa, AE…), détecte s'il est
réellement complété (cases remplies, signature, totaux non nuls). Détection
déterministe sur signal fort → Haiku 4.5.

Source : NotebookLM N2 (Pièces administratives — DC4 détaillé ; autres champs =
pratique standard signalée).
Raw extract: docs/notebook-extracts/skill-22-validation-completude-document-raw.md
System prompt: prompts/validation_completude_document.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    type_document: str  # "DPGF" | "DC1" | "DC2" | "AE" | "BPU" | …
    snapshot: str  # contenu/structure du document édité (texte ou champs sérialisés)


class Output(SkillOutput):
    is_complete: bool
    champs_manquants: list[str] = []
    confidence: float = Field(ge=0.0, le=1.0)


@register
class ValidationCompletudeDocument(Skill):
    name = "validation-completude-document"
    category = "extraction"
    model = "claude-haiku-4-5"
    version = "1"
    system_prompt_path = "prompts/validation_completude_document.md"

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
        return f"""## Type de document
{inp.type_document}

## Snapshot du document édité
{inp.snapshot}

## Vérifie la complétude en JSON conforme au schéma Output.
"""
