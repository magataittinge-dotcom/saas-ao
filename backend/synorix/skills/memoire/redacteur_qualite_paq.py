"""Skill #48 — redacteur-qualite-paq.

Rédige toujours la section qualité (organisation, points d'arrêt, autocontrôles,
traçabilité, non-conformités, indicateurs) ; et, si l'option PAQ est activée,
produit en plus un PAQ / SOPAQ structuré (en respectant la structure imposée par le RC).

Modèle : Sonnet 4.6 (rédaction bornée, conformité qualité).
Source : NotebookLM N3 (Mémoires gagnants) — PAQ/SOPAQ, points d'arrêt.
Raw extract: docs/notebook-extracts/skill-48-redacteur-qualite-paq-raw.md
System prompt: prompts/redacteur_qualite_paq.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    cctp_text: str = ""
    contexte_chantier: str = ""
    indicateurs_entreprise: list[str] = Field(default_factory=list)
    structure_sopaq_rc: str | None = None  # structure imposée par le RC si connue
    generer_paq: bool = False


class SectionQualite(BaseModel):
    titre: str
    organisation_markdown: str
    points_arret: list[str]
    autocontroles: list[str]
    gestion_non_conformites_markdown: str
    indicateurs: list[str] = Field(default_factory=list)
    longueur_estimee_mots: int


class PAQ(BaseModel):
    titre: str
    contenu_markdown: str
    structure_imposee_rc: str


class Output(SkillOutput):
    section_qualite: SectionQualite
    paq: PAQ | None = None
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RedacteurQualitePaq(Skill):
    name = "redacteur-qualite-paq"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "2"  # v2 : KPI qualité chiffrés sourcés (ISO 9001) — corpus N3 enrichi
    system_prompt_path = "prompts/redacteur_qualite_paq.md"

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

## Option PAQ : {"ACTIVÉE — produire un PAQ/SOPAQ" if inp.generer_paq else "désactivée — paq = null"}

## Rédige la section qualité (JSON conforme au schéma Output).
Points d'arrêt et autocontrôles explicites. Aucun KPI ni certification inventé.
"""
