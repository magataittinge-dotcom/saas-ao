"""Skill #73 — recherche-page-garde-memoire.

Génère la page de garde du mémoire : éléments obligatoires (lot, MOA, intitulé
AO, référence, date), logos de réassurance, charte, chaînage au sommaire.

Modèle : Sonnet 4.6.
Source : NotebookLM N3 (Mémoires gagnants / Cariso, SERI).
Raw extract: docs/notebook-extracts/skill-72-73-74-75-export-raw.md
System prompt: prompts/recherche_page_garde_memoire.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    intitule_ao: str = ""
    lot: str = ""
    moa: str = ""
    reference_consultation: str = ""
    date: str = ""
    certifications: list[str] = Field(default_factory=list)


class ElementPageGarde(BaseModel):
    champ: str
    valeur: str


class PageGarde(BaseModel):
    elements: list[ElementPageGarde]
    logos_reassurance: list[str] = Field(default_factory=list)
    charte: str = ""
    chaine_sommaire: bool = True


class Output(SkillOutput):
    page_garde: PageGarde
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RecherchePageGardeMemoire(Skill):
    name = "recherche-page-garde-memoire"
    category = "export"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/recherche_page_garde_memoire.md"

    notebook_sources = ["N3"]
    pipeline_step = 6
    differentiateur = 2  # D2 (PRD §1.7)

    async def run(self, inp: Input, *, client: Client) -> Output:
        import json

        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                "## Données de l'AO\n"
                f"{json.dumps(inp.model_dump(exclude={'project_id'}), ensure_ascii=False, indent=2)}\n\n"
                "## Génère la page de garde (JSON conforme au schéma Output)."
            ),
            schema=Output,
        )
        return Output.model_validate(raw)
