"""Skill #74 — recherche-checklist-depot-plateforme.

Produit une checklist de dépôt (incluse dans le ZIP) : vérifications avant
« envoyer » (lot, fichiers, signature, nommage, format, délai, preuve) + pièges.

Modèle : Sonnet 4.6.
Source : NotebookLM N5 + pratiques BE (réutilise #67).
Raw extract: docs/notebook-extracts/skill-72-73-74-75-export-raw.md
System prompt: prompts/recherche_checklist_depot_plateforme.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    plateforme: str = ""
    multi_lots: bool = False


class ItemChecklist(BaseModel):
    item: str
    categorie: str
    coche: bool = False


class Output(SkillOutput):
    checklist: list[ItemChecklist]
    pieges_frequents: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RechercheChecklistDepotPlateforme(Skill):
    name = "recherche-checklist-depot-plateforme"
    category = "export"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/recherche_checklist_depot_plateforme.md"

    notebook_sources = ["N5"]
    pipeline_step = 6
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Plateforme : {inp.plateforme or '(générique PLACE/AWS)'}\n"
                f"## Multi-lots : {inp.multi_lots}\n\n"
                "## Produis la checklist de dépôt (JSON conforme au schéma Output)."
            ),
            schema=Output,
        )
        return Output.model_validate(raw)
