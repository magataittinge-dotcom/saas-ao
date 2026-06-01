"""Skill #59 — editeur-reecriture-instruction.

Réécrit un paragraphe sélectionné selon une instruction utilisateur libre
(ton/contenu/longueur), sans aucune dérive factuelle (chiffres, normes,
certifications, engagements, noms préservés).

Modèle : Opus 4.7 (réécriture nuancée fidèle au fond).
Source : NotebookLM N3 (Mémoires gagnants) — préservation du socle factuel.
Raw extract: docs/notebook-extracts/skill-58-59-editeurs-raw.md
System prompt: prompts/editeur_reecriture_instruction.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    paragraphe: str
    instruction: str
    contexte_section: str = ""


class Output(SkillOutput):
    paragraphe_reecrit: str
    instruction_appliquee: str
    faits_preserves: list[str] = Field(default_factory=list)
    derive_factuelle_evitee: list[str] = Field(default_factory=list)
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class EditeurReecritureInstruction(Skill):
    name = "editeur-reecriture-instruction"
    category = "memoire"
    model = "claude-opus-4-7"
    version = "1"
    system_prompt_path = "prompts/editeur_reecriture_instruction.md"

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
        return f"""## Paragraphe à réécrire
{inp.paragraphe}

## Instruction utilisateur
{inp.instruction}

## Contexte de la section
{inp.contexte_section or "(non précisé)"}

## Réécris le paragraphe (JSON conforme au schéma Output).
Applique l'instruction sans altérer ni inventer un fait. Préserve chiffres/normes/noms.
"""
