"""Skill #76 — recherche-structure-profil-entreprise-btp.

Définit la structure canonique du profil entreprise BTP (champs, types,
validations) alignée DC1/DC2, réutilisable mémoire + déclaration sur l'honneur.

Modèle : Sonnet 4.6.
Source : NotebookLM N2 (DC1/DC2).
Raw extract: docs/notebook-extracts/skill-76-80-sidebar-raw.md
System prompt: prompts/recherche_structure_profil_entreprise_btp.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Champ(BaseModel):
    nom: str
    type: str
    validation: str
    obligatoire: bool = True


class SectionProfil(BaseModel):
    nom: str
    champs: list[Champ]


class Output(SkillOutput):
    sections: list[SectionProfil]
    couvre_dc2: bool = True
    sources_nbk: list[str]


class Input(SkillInput):
    pass


@register
class RechercheStructureProfilEntrepriseBtp(Skill):
    name = "recherche-structure-profil-entreprise-btp"
    category = "sidebar"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/recherche_structure_profil_entreprise_btp.md"

    notebook_sources = ["N2"]
    pipeline_step = "sidebar"
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt="## Définis la structure canonique du profil entreprise BTP (JSON conforme au schéma Output).",
            schema=Output,
        )
        return Output.model_validate(raw)
