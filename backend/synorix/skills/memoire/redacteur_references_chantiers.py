"""Skill #43 — redacteur-references-chantiers.

Rédige la section "Nos références chantiers" : intro courte + tableau formaté
(Année / Intitulé / Adresse / MOA / MOE / Lot / Montant HT), format Cariso/SERI,
avec emplacements photos annotées. Intègre fidèlement la sélection de la skill #37.

Modèle : Sonnet 4.6 (mise en forme structurée, fidélité aux données).
Source : NotebookLM N3 (Mémoires gagnants) — colonnes, photos avant/après, volumétrie 3-5.
Raw extract: docs/notebook-extracts/skill-43-redacteur-references-chantiers-raw.md
System prompt: prompts/redacteur_references_chantiers.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    # Références sélectionnées par la skill #37 (id + champs détaillés).
    references_selectionnees: list[dict]


class Tableau(BaseModel):
    colonnes: list[str]
    lignes: list[list[str]]


class DetailReference(BaseModel):
    intitule: str
    contraintes_surmontees: str
    respect_delais: str
    contact_moa: str
    emplacements_photos: list[str] = Field(default_factory=list)


class SectionReferences(BaseModel):
    titre: str
    introduction_markdown: str
    tableau: Tableau
    details_references: list[DetailReference]
    longueur_estimee_mots: int


class Output(SkillOutput):
    section: SectionReferences
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RedacteurReferencesChantiers(Skill):
    name = "redacteur-references-chantiers"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/redacteur_references_chantiers.md"

    notebook_sources = ["N3"]
    pipeline_step = 4
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        user_prompt = self._build_user_prompt(inp)
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=user_prompt,
            schema=Output,
            max_tokens=4096,
        )
        return Output.model_validate(raw)

    def _build_user_prompt(self, inp: Input) -> str:
        import json

        return f"""## Références sélectionnées (skill #37) — {len(inp.references_selectionnees)} (max 5)
{json.dumps(inp.references_selectionnees, ensure_ascii=False, indent=2)}

## Rédige la section "Nos références chantiers" (JSON conforme au schéma Output).
Tableau 7 colonnes. Donnée manquante → "[À COMPLÉTER]". N'invente aucune référence.
"""
