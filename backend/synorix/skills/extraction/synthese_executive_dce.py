"""Skill #23 — synthese-executive-dce.

Produit le bandeau « infos clés » (zone 1 de Step 3) par agrégation des outputs
des skills #2, #4, #5, #13, #15, #16. Aucune information inventée — pure synthèse.
Sonnet 4.6.

Skill d'agrégation : pas de NotebookLM (assemble des faits déjà extraits/sourcés).
Raw extract: docs/notebook-extracts/skill-23-synthese-executive-dce-raw.md
System prompt: prompts/synthese_executive_dce.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    date_limite: str | None = None  # #2
    plateforme: str | None = None  # #4
    visite_obligatoire: bool | None = None  # #5
    criteres: str | None = None  # #13 (synthèse pondérations)
    garanties: str | None = None  # #15 (synthèse)
    nb_pieges: int | None = None  # #16
    nom_chantier: str | None = None


class LigneCle(BaseModel):
    libelle: str
    valeur: str
    priorite: int  # 1 = plus prioritaire


class Output(SkillOutput):
    lignes: list[LigneCle]


@register
class SyntheseExecutiveDce(Skill):
    name = "synthese-executive-dce"
    category = "extraction"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/synthese_executive_dce.md"

    notebook_sources = []  # agrégation de faits déjà extraits
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
        return f"""## Faits extraits (skills amont)
- Chantier : {inp.nom_chantier or "(inconnu)"}
- Date limite : {inp.date_limite or "(inconnue)"}
- Plateforme : {inp.plateforme or "(inconnue)"}
- Visite obligatoire : {inp.visite_obligatoire}
- Critères / pondérations : {inp.criteres or "(inconnus)"}
- Garanties : {inp.garanties or "(inconnues)"}
- Nombre de pièges détectés : {inp.nb_pieges}

## Produis le bandeau infos clés (priorisé) en JSON conforme au schéma Output.
"""
