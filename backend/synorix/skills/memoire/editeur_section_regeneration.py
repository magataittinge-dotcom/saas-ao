"""Skill #58 — editeur-section-regeneration.

Régénère une section ciblée du mémoire (au clic [Régénérer]) en préservant la
cohérence avec les sections déjà validées et les données socles (chiffres,
normes/DTU, certifications, affectations nominatives), sans dérive factuelle.

Modèle : Opus 4.7 (réécriture à enjeu, cohérence inter-sections).
Source : NotebookLM N3 (Mémoires gagnants) — données socles, checklist de relecture.
Raw extract: docs/notebook-extracts/skill-58-59-editeurs-raw.md
System prompt: prompts/editeur_section_regeneration.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    section_cible: str  # titre/id de la section à régénérer
    contenu_actuel: str = ""
    sections_validees: list[dict] = Field(default_factory=list)  # contexte mémoire complet
    consigne: str = ""  # ex: orientation souhaitée pour la régénération


class SectionRegeneree(BaseModel):
    titre: str
    contenu_markdown: str
    longueur_estimee_mots: int


class CoherenceCheck(BaseModel):
    renvois_internes_ok: bool
    incoherences: list[str] = Field(default_factory=list)


class Output(SkillOutput):
    section_regeneree: SectionRegeneree
    donnees_socles_preservees: list[str] = Field(default_factory=list)
    coherence_check: CoherenceCheck
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class EditeurSectionRegeneration(Skill):
    name = "editeur-section-regeneration"
    category = "memoire"
    model = "claude-opus-4-7"
    version = "1"
    system_prompt_path = "prompts/editeur_section_regeneration.md"

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

        return f"""## Section à régénérer : {inp.section_cible}

## Contenu actuel
{inp.contenu_actuel or "(vide)"}

## Consigne de régénération
{inp.consigne or "(améliorer style et structure sans changer le fond)"}

## Sections déjà validées (contexte — données socles à préserver)
{json.dumps(inp.sections_validees, ensure_ascii=False, indent=2)}

## Régénère la section (JSON conforme au schéma Output).
Préserve chiffres/normes/certifs/noms. Vérifie renvois internes et cohérence.
"""
