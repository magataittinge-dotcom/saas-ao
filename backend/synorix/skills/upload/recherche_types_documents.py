"""Skill #1 — recherche-types-documents.

Classifie chaque fichier d'un DCE BTP vers un type de document canonique
(RC, CCAP, CCTP, AE/ATTRI1, DPGF, BPU, DQE, DC1, DC2, DC4, mémoire technique,
planning, plan, attestation, …) à partir du nom de fichier + des premiers
caractères du contenu. Classification multi-classes → Haiku 4.5.

Source : NotebookLM N2 (Pièces administratives BTP).
Raw extract: docs/notebook-extracts/skill-01-recherche-types-documents-raw.md
System prompt: prompts/recherche_types_documents.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    filename: str
    text_excerpt: str = ""  # premiers ~2000 caractères du contenu textuel
    mime_type: str | None = None
    size_bytes: int | None = None


class Output(SkillOutput):
    type_canonique: str  # ex. "RC", "CCAP", "CCTP", "AE", "DPGF", … ou "autre"
    libelle: str  # libellé humain ("Règlement de la consultation")
    categorie: str  # administratif | technique | financier | annexe | plan
    confidence: float = Field(ge=0.0, le=1.0)  # interne, jamais exposé à l'UI
    not_found: bool = False  # true si classification impossible avec confiance


@register
class RechercheTypesDocuments(Skill):
    name = "recherche-types-documents"
    category = "upload"
    model = "claude-haiku-4-5"
    version = "1"
    system_prompt_path = "prompts/recherche_types_documents.md"

    notebook_sources = ["N2"]
    pipeline_step = 1
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
        meta = []
        if inp.mime_type:
            meta.append(f"MIME: {inp.mime_type}")
        if inp.size_bytes is not None:
            meta.append(f"Taille: {inp.size_bytes} octets")
        meta_line = " | ".join(meta) or "(aucune métadonnée)"
        return f"""## Fichier à classifier

Nom : {inp.filename}
Métadonnées : {meta_line}

## Extrait du contenu (premiers caractères)
{inp.text_excerpt or "(vide)"}

## Classe ce document en JSON conforme au schéma Output.
"""
