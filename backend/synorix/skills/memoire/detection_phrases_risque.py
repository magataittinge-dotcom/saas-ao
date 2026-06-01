"""Skill #60 — detection-phrases-risque.

Avant export, détecte dans le mémoire les phrases à risque (engagements absolus,
promesses non quantifiables, contradictions CCTP / variantes déguisées, renvois
externes contournant le CRT), avec une alternative prudente. Détection ciblée.

Modèle : Sonnet 4.6 (analyse juridique nuancée).
Source : NotebookLM N6 (Pièges/Jurisprudence) — irrégularité, variantes, CRT.
Raw extract: docs/notebook-extracts/skill-60-detection-phrases-risque-raw.md
System prompt: prompts/detection_phrases_risque.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    memoire_text: str
    cctp_text: str = ""  # pour détecter les contradictions
    rc_contraintes: str = ""  # CRT, limite de pages, variantes autorisées ou non


class PhraseRisque(BaseModel):
    extrait: str
    categorie: str
    niveau: str
    risque: str
    alternative_prudente: str


class Output(SkillOutput):
    phrases_risque: list[PhraseRisque]
    nb_detecte: int
    sources_nbk: list[str]


@register
class DetectionPhrasesRisque(Skill):
    name = "detection-phrases-risque"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/detection_phrases_risque.md"

    notebook_sources = ["N6"]
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
        return f"""## Contraintes RC (CRT, limite de pages, variantes)
{inp.rc_contraintes or "(non précisées)"}

## CCTP (pour détecter les contradictions)
{inp.cctp_text or "(non fourni)"}

## Mémoire à relire
{inp.memoire_text}

## Détecte les phrases à risque (JSON conforme au schéma Output).
Détection ciblée, alternative prudente pour chacune. Aucune surinflation.
"""
