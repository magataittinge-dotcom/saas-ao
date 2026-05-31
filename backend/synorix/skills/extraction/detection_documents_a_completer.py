"""Skill #21 — detection-documents-a-completer.

Identifie parmi les documents du DCE ceux qui sont des templates à compléter par
le candidat (DPGF, BPU, DC1, DC2, DC4, AE, attestations templates) et leur
format d'édition. Sonnet 4.6.

Réutilise la taxonomie documentaire de la skill #1 (NotebookLM N2).
Raw extract: docs/notebook-extracts/skill-21-detection-documents-a-completer-raw.md
System prompt: prompts/detection_documents_a_completer.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class DocumentDce(BaseModel):
    filename: str
    type_detecte: str | None = None
    premiere_page: str = ""


class Input(SkillInput):
    documents: list[DocumentDce]


class DocumentACompleter(BaseModel):
    filename: str
    type_document: str
    format_edition: str  # "tableau" | "cerfa" | "texte_libre"


class Output(SkillOutput):
    a_completer: list[DocumentACompleter]
    confidence: float = Field(ge=0.0, le=1.0)


@register
class DetectionDocumentsACompleter(Skill):
    name = "detection-documents-a-completer"
    category = "extraction"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/detection_documents_a_completer.md"

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
        docs = "\n".join(
            f"- {d.filename} (type={d.type_detecte or '?'})" for d in inp.documents
        ) or "(aucun)"
        return f"""## Documents du DCE
{docs}

## Identifie les documents à compléter (templates) en JSON conforme au schéma Output.
"""
