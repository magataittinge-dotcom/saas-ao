"""Skill #41 — redacteur-presentation-entreprise.

Rédige la PARTIE A — Présentation de l'entreprise (historique, identité,
capacités, certifications, valeurs), une sous-section par rubrique canonique,
sans invention et sans "plaqué corporate".

Modèle : Opus 4.7 (rédaction long-form, différenciateur produit).
Source : NotebookLM N3 (Mémoires gagnants) — rubriques canoniques, anti-autobiographie.
Raw extract: docs/notebook-extracts/skill-41-redacteur-presentation-entreprise-raw.md
System prompt: prompts/redacteur_presentation_entreprise.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    profil_entreprise: dict = Field(default_factory=dict)
    proximite_chantier: str | None = None  # pour valoriser l'ancrage local


class SousSection(BaseModel):
    titre: str
    contenu_markdown: str


class PartieMemoire(BaseModel):
    titre: str
    sous_sections: list[SousSection]
    longueur_estimee_mots: int


class Output(SkillOutput):
    section: PartieMemoire
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RedacteurPresentationEntreprise(Skill):
    name = "redacteur-presentation-entreprise"
    category = "memoire"
    model = "claude-opus-4-7"
    version = "1"
    system_prompt_path = "prompts/redacteur_presentation_entreprise.md"

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
            max_tokens=8192,
        )
        return Output.model_validate(raw)

    def _build_user_prompt(self, inp: Input) -> str:
        import json

        return f"""## Profil entreprise (source unique — ne jamais inventer)
{json.dumps(inp.profil_entreprise, ensure_ascii=False, indent=2)}

## Proximité avec le chantier (ancrage local)
{inp.proximite_chantier or "(non précisée)"}

## Rédige la PARTIE A (JSON conforme au schéma Output).
Une sous-section par rubrique canonique, dense et factuelle, sans plaqué corporate.
Tout champ absent → [À COMPLÉTER PAR L'ENTREPRISE].
"""
