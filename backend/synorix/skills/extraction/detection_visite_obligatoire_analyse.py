"""Skill #14 — detection-visite-obligatoire (analyse-side).

Formatte pour la zone 1 (bandeau) de l'écran d'analyse l'information de visite
obligatoire déjà extraite par la skill #5 (upload-side). Présentation premium,
factuelle, action-oriented. Sonnet 4.6.

Skill de présentation : ré-utilise les outputs de #5, ne ré-interroge pas le DCE.
Pas de NotebookLM (formatage UX). Voir #5 pour la source d'expertise (N6+N1).
Raw extract: docs/notebook-extracts/skill-14-detection-visite-obligatoire-analyse-raw.md
System prompt: prompts/detection_visite_obligatoire_analyse.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    # Reprend les outputs de la skill #5
    is_mandatory: bool
    dates: list[str] = []
    heure: str | None = None
    lieu: str | None = None
    modalites_inscription: str | None = None
    sanction: str | None = None


class Output(SkillOutput):
    afficher: bool  # surfacé en bandeau uniquement si visite obligatoire
    niveau: str = "info"  # "critique" si obligatoire, sinon "info"
    titre: str
    lignes: list[str]  # lignes prêtes à afficher (date, lieu, modalités, sanction)
    action: str | None = None  # call-to-action (ex. "S'inscrire avant le …")


@register
class DetectionVisiteObligatoireAnalyse(Skill):
    name = "detection-visite-obligatoire-analyse"
    category = "extraction"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/detection_visite_obligatoire_analyse.md"

    notebook_sources = []  # skill de présentation ; expertise héritée de #5
    pipeline_step = 3
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        user_prompt = self._build_user_prompt(inp)
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=user_prompt,
            schema=Output,
        )
        return Output.model_validate(raw)

    def _build_user_prompt(self, inp: Input) -> str:
        return f"""## Données de visite (issues de la skill #5)
- Obligatoire : {inp.is_mandatory}
- Dates : {", ".join(inp.dates) or "(aucune)"}
- Heure : {inp.heure or "(non précisée)"}
- Lieu : {inp.lieu or "(non précisé)"}
- Modalités d'inscription : {inp.modalites_inscription or "(non précisées)"}
- Sanction : {inp.sanction or "(non précisée)"}

## Formatte le bloc bandeau visite en JSON conforme au schéma Output.
"""
