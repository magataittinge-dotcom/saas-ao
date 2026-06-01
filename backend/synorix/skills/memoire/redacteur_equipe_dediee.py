"""Skill #42 — redacteur-equipe-dediee.

Rédige la sous-section "Équipe dédiée au chantier" : conducteur de travaux, chef
de chantier, compagnons, avec CV synthétiques factuels et engagement FERME
d'affectation (cf. jurisprudence CE 21 mars 2018, anti-affectation conditionnelle).

Modèle : Sonnet 4.6 (rédaction bornée, factuelle).
Source : NotebookLM N3 (Mémoires gagnants) — CV factuels, erreurs fatales.
Raw extract: docs/notebook-extracts/skill-42-redacteur-equipe-dediee-raw.md
System prompt: prompts/redacteur_equipe_dediee.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    equipe_moyens: dict = Field(default_factory=dict)  # membres, habilitations (Mon entreprise)
    profil_ao: dict = Field(default_factory=dict)  # pour cibler le track record (type de chantier)


class CVMembre(BaseModel):
    role: str
    nom: str
    anciennete: str
    track_record: list[str] = Field(default_factory=list)
    habilitations: list[str] = Field(default_factory=list)


class SectionEquipe(BaseModel):
    titre: str
    introduction_markdown: str
    cv_membres: list[CVMembre]
    longueur_estimee_mots: int


class Output(SkillOutput):
    section: SectionEquipe
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RedacteurEquipeDediee(Skill):
    name = "redacteur-equipe-dediee"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/redacteur_equipe_dediee.md"

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

        return f"""## Équipe et moyens (rubrique "Mon entreprise" — source unique)
{json.dumps(inp.equipe_moyens, ensure_ascii=False, indent=2)}

## Profil de l'AO (pour cibler le track record similaire)
{json.dumps(inp.profil_ao, ensure_ascii=False, indent=2)}

## Rédige la section "Équipe dédiée" (JSON conforme au schéma Output).
Engagement FERME d'affectation (jamais conditionnel). N'invente aucun nom ni habilitation.
"""
