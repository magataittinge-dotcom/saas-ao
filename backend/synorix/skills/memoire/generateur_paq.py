"""Skill #55 — generateur-paq.

Variante de #48 : génère un PAQ autonome (pièce séparée) — organisation qualité,
points d'arrêt, autocontrôles, plan de surveillance, non-conformités, indicateurs
quantifiés. Respecte la structure SOPAQ imposée par le RC.

Modèle : Sonnet 4.6.
Source : NotebookLM N3 (Mémoires gagnants) — PAQ/SOPAQ, points d'arrêt, indicateurs.
Raw extract: docs/notebook-extracts/skill-51-53-54-55-variants-raw.md (+ skill-48-...-raw.md)
System prompt: prompts/generateur_paq.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    cctp_text: str = ""
    contexte_chantier: str = ""
    indicateurs_entreprise: list[str] = Field(default_factory=list)
    structure_sopaq_rc: str | None = None


class PAQ(BaseModel):
    titre: str
    organisation_markdown: str
    points_arret: list[str]
    autocontroles: list[str]
    plan_surveillance_markdown: str
    gestion_non_conformites_markdown: str
    indicateurs_quantifies: list[str] = Field(default_factory=list)
    structure_imposee_rc: str
    longueur_estimee_mots: int


class Output(SkillOutput):
    paq: PAQ
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class GenerateurPaq(Skill):
    name = "generateur-paq"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/generateur_paq.md"

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
            max_tokens=6144,
        )
        return Output.model_validate(raw)

    def _build_user_prompt(self, inp: Input) -> str:
        indic = "\n".join(f"- {i}" for i in inp.indicateurs_entreprise) or "(aucun fourni)"
        return f"""## Contexte chantier
{inp.contexte_chantier or "(non précisé)"}

## Indicateurs qualité de l'entreprise
{indic}

## Structure SOPAQ imposée par le RC
{inp.structure_sopaq_rc or "[À COMPLÉTER — structure SOPAQ imposée par le RC]"}

## CCTP du lot
{inp.cctp_text or "(non fourni)"}

## Génère le PAQ autonome (JSON conforme au schéma Output).
Points d'arrêt + autocontrôles explicites, indicateurs quantifiés. Aucun KPI inventé.
"""
