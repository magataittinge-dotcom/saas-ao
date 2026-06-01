"""Skill #72 — recherche-format-zip-ao-pro.

Définit la structure du ZIP final de dépôt : sous-dossiers (Candidature / Offre
par lot), racine (checklist), conforme PLACE/AWS, noms sans espaces/accents.

Modèle : Haiku 4.5.
Source : NotebookLM N5 + pratiques BE (réutilise #63/#67).
Raw extract: docs/notebook-extracts/skill-72-73-74-75-export-raw.md
System prompt: prompts/recherche_format_zip_ao_pro.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    lots: list[str] = Field(default_factory=list)
    pieces_candidature: list[str] = Field(default_factory=list)
    pieces_offre: list[str] = Field(default_factory=list)


class Dossier(BaseModel):
    nom: str
    contenu: list[str] = Field(default_factory=list)


class StructureZip(BaseModel):
    racine: list[str] = Field(default_factory=list)
    dossiers: list[Dossier]


class Output(SkillOutput):
    structure_zip: StructureZip
    regles: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RechercheFormatZipAoPro(Skill):
    name = "recherche-format-zip-ao-pro"
    category = "export"
    model = "claude-haiku-4-5"
    version = "1"
    system_prompt_path = "prompts/recherche_format_zip_ao_pro.md"

    notebook_sources = ["N5"]
    pipeline_step = 6
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        import json

        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Lots : {inp.lots or '(lot unique)'}\n"
                f"## Pièces candidature : {json.dumps(inp.pieces_candidature, ensure_ascii=False)}\n"
                f"## Pièces offre : {json.dumps(inp.pieces_offre, ensure_ascii=False)}\n\n"
                "## Définis la structure du ZIP (JSON conforme au schéma Output)."
            ),
            schema=Output,
        )
        return Output.model_validate(raw)
