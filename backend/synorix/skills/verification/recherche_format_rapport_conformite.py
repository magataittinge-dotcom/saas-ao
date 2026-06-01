"""Skill #64 — recherche-format-rapport-conformite.

Définit le format du rapport de conformité affiché avant dépôt : sections,
ordre, criticité (bloquant/recommandé/conforme), ton positif et actionnable.

Modèle : Sonnet 4.6 (structuration nuancée).
Source : pratiques BE + skills amont (#68, #69, #70).
Raw extract: docs/notebook-extracts/skill-64-recherche-format-rapport-conformite-raw.md
System prompt: prompts/recherche_format_rapport_conformite.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    contexte_dossier: dict = Field(default_factory=dict)  # pièces, validité, score (amont)


class ItemRapport(BaseModel):
    libelle: str
    statut: str  # conforme | a_ajouter | a_corriger
    criticite: str  # bloquant | recommande | conforme


class SectionRapport(BaseModel):
    titre: str
    ordre: int
    criticite_max: str
    items: list[ItemRapport] = Field(default_factory=list)


class Rapport(BaseModel):
    sections: list[SectionRapport]
    ton: str = "positif-actionnable"
    recapitulatif_actions: list[str] = Field(default_factory=list)


class Output(SkillOutput):
    rapport: Rapport
    sources_nbk: list[str]


@register
class RechercheFormatRapportConformite(Skill):
    name = "recherche-format-rapport-conformite"
    category = "verification"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/recherche_format_rapport_conformite.md"

    notebook_sources = ["N6"]
    pipeline_step = 5
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        import json

        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                "## Contexte du dossier (sorties amont)\n"
                f"{json.dumps(inp.contexte_dossier, ensure_ascii=False, indent=2)}\n\n"
                "## Produis le format du rapport de conformité (JSON conforme au schéma Output)."
            ),
            schema=Output,
        )
        return Output.model_validate(raw)
