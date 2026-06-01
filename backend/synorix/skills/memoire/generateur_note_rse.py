"""Skill #57 — generateur-note-rse.

Rédige une note RSE (social, environnemental, économique) spécifique au chantier,
avec KPIs adossés à des preuves (anti-greenwashing) et engagement d'insertion
sociale quantifié si clause sociale.

Modèle : Sonnet 4.6 (rédaction bornée, conformité RSE).
Source : NotebookLM N3 (Mémoires gagnants) — preuves, insertion sociale, clauses.
Raw extract: docs/notebook-extracts/skill-57-generateur-note-rse-raw.md
System prompt: prompts/generateur_note_rse.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    contexte_chantier: str = ""
    clause_sociale: str | None = None  # ex: "200 heures d'insertion"
    engagements_entreprise: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)


class KPI(BaseModel):
    libelle: str
    valeur: str
    preuve: str


class NoteRSE(BaseModel):
    titre: str
    volet_social_markdown: str
    volet_environnemental_markdown: str
    volet_economique_markdown: str
    kpis: list[KPI] = Field(default_factory=list)
    longueur_estimee_mots: int


class Output(SkillOutput):
    note_rse: NoteRSE
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class GenerateurNoteRse(Skill):
    name = "generateur-note-rse"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/generateur_note_rse.md"

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
        engagements = "\n".join(f"- {e}" for e in inp.engagements_entreprise) or "(aucun fourni)"
        certifs = "\n".join(f"- {c}" for c in inp.certifications) or "(aucune fournie)"
        return f"""## Contexte chantier
{inp.contexte_chantier or "(non précisé)"}

## Clause sociale du marché
{inp.clause_sociale or "(non mentionnée)"}

## Engagements RSE de l'entreprise (source unique)
{engagements}

## Certifications (preuves)
{certifs}

## Rédige la note RSE (JSON conforme au schéma Output).
3 volets. Chaque KPI adossé à une preuve (anti-greenwashing). Clause sociale quantifiée.
"""
