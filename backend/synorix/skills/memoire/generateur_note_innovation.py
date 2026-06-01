"""Skill #56 — generateur-note-innovation.

Rédige une note d'innovation spécifique au chantier : innovations techniques,
organisationnelles, environnementales, chacune associée à un bénéfice chiffré et
mesurable (sinon écartée comme gadget), avec rappel juridique des variantes.

Modèle : Opus 4.7 (synthèse à enjeu, différenciateur produit).
Source : NotebookLM N3 (Mémoires gagnants) — innovation utile vs gadget, variantes.
Raw extract: docs/notebook-extracts/skill-56-generateur-note-innovation-raw.md
System prompt: prompts/generateur_note_innovation.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    cctp_text: str = ""
    contexte_chantier: str = ""
    procedure: str = "MAPA"  # MAPA | formalisée (pour le rappel variantes)
    atouts_entreprise: list[str] = Field(default_factory=list)


class Innovation(BaseModel):
    type: str
    description: str
    benefice_chiffre: str
    justification_technique: str
    incidence_financiere: str
    est_variante: bool = False
    rappel_juridique: str = ""


class NoteInnovation(BaseModel):
    titre: str
    innovations: list[Innovation]
    longueur_estimee_mots: int


class Output(SkillOutput):
    note_innovation: NoteInnovation
    gadgets_ecartes: list[str] = Field(default_factory=list)
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class GenerateurNoteInnovation(Skill):
    name = "generateur-note-innovation"
    category = "memoire"
    model = "claude-opus-4-7"
    version = "1"
    system_prompt_path = "prompts/generateur_note_innovation.md"

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
        atouts = "\n".join(f"- {a}" for a in inp.atouts_entreprise) or "(aucun fourni)"
        return f"""## Contexte chantier
{inp.contexte_chantier or "(non précisé)"}

## Procédure de passation : {inp.procedure}

## Atouts / procédés de l'entreprise (source unique)
{atouts}

## CCTP du lot
{inp.cctp_text or "(non fourni)"}

## Rédige la note d'innovation (JSON conforme au schéma Output).
Chaque innovation = bénéfice chiffré + justification. Signale les variantes. Écarte les gadgets.
"""
