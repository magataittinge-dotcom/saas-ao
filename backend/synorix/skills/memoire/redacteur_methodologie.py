"""Skill #45 — redacteur-methodologie.

Rédige la PARTIE C — Méthodologie d'exécution (la section la plus pondérée par
les commissions) : phases chronologiques, choix techniques, points singuliers,
autocontrôles, selon la méthode SPAC. Adapté au CCTP, nourri par l'expert métier.

Modèle : Opus 4.7 (rédaction long-form à enjeu, différenciateur produit).
Source : NotebookLM N3 (Mémoires gagnants) + N4 (DTU par corps de métier).
Raw extract: docs/notebook-extracts/skill-45-redacteur-methodologie-raw.md
System prompt: prompts/redacteur_methodologie.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    cctp_text: str
    corps_de_metier: str
    methodologie_expert: dict = Field(default_factory=dict)  # sortie skill #25-#34
    bibliotheque_phrases: list[str] = Field(default_factory=list)  # skill #38
    donnees_ao: dict = Field(default_factory=dict)


class PhaseMethodo(BaseModel):
    nom: str
    mode_operatoire_markdown: str
    normes_citees: list[str] = Field(default_factory=list)
    points_singuliers: list[str] = Field(default_factory=list)
    autocontroles: list[str] = Field(default_factory=list)
    benefice_acheteur: str


class SectionMethodo(BaseModel):
    titre: str
    phases: list[PhaseMethodo]
    longueur_estimee_mots: int


class Output(SkillOutput):
    section: SectionMethodo
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RedacteurMethodologie(Skill):
    name = "redacteur-methodologie"
    category = "memoire"
    model = "claude-opus-4-7"
    version = "1"
    system_prompt_path = "prompts/redacteur_methodologie.md"

    notebook_sources = ["N3", "N4"]
    pipeline_step = 4
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        user_prompt = self._build_user_prompt(inp)
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=user_prompt,
            schema=Output,
            max_tokens=8192,
        )
        return Output.model_validate(raw)

    def _build_user_prompt(self, inp: Input) -> str:
        import json

        phrases = "\n".join(f"- {p}" for p in inp.bibliotheque_phrases) or "(aucune)"
        return f"""## Données de l'AO
{json.dumps(inp.donnees_ao, ensure_ascii=False, indent=2)}

## Corps de métier : {inp.corps_de_metier}

## Méthodologie de l'expert métier (skills #25-#34) — chiffres/normes à préserver verbatim
{json.dumps(inp.methodologie_expert, ensure_ascii=False, indent=2)}

## Phrases de la bibliothèque (skill #38)
{phrases}

## CCTP du lot
{inp.cctp_text}

## Rédige la PARTIE C — Méthodologie (JSON conforme au schéma Output).
Phases chronologiques, méthode SPAC, normes DTU verbatim, autocontrôles explicites.
"""
