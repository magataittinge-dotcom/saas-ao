"""Skill #38 — recuperation-bibliotheque-memoire.

Récupère dans la bibliothèque mémoire de l'utilisateur les blocs (paragraphes
thématiques) pertinents pour une section ET un corps de métier donnés, classés
par pertinence, en excluant les blocs au métier incompatible.

Modèle : Haiku 4.5 (filtrage + classement sur signal fort).
Source : NotebookLM N3 (Mémoires gagnants) — double axe section/métier, granularité paragraphe.
Raw extract: docs/notebook-extracts/skill-38-recuperation-bibliotheque-memoire-raw.md
System prompt: prompts/recuperation_bibliotheque_memoire.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    user_id: int
    section_cible: str  # ex: "methodologie", "securite", "environnement"
    corps_de_metier: str  # ex: "ITE", "Gros Œuvre"
    contexte_ao: str = ""  # mots-clés du chantier (école, site occupé...)
    bibliotheque: list[dict] = Field(default_factory=list)  # blocs (id, extrait, section, metier)


class PhraseCandidate(BaseModel):
    bloc_id: str
    extrait: str
    score_pertinence: int
    section: str
    corps_de_metier: str


class Output(SkillOutput):
    phrases_candidates: list[PhraseCandidate]
    incoherences_exclues: list[str] = Field(default_factory=list)
    granularite_recommandee: str = "paragraphe-thematique"


@register
class RecuperationBibliothequeMemoire(Skill):
    name = "recuperation-bibliotheque-memoire"
    category = "memoire"
    model = "claude-haiku-4-5"
    version = "1"
    system_prompt_path = "prompts/recuperation_bibliotheque_memoire.md"

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
        )
        return Output.model_validate(raw)

    def _build_user_prompt(self, inp: Input) -> str:
        import json

        return f"""## Cible
- Section : {inp.section_cible}
- Corps de métier : {inp.corps_de_metier}
- Contexte AO : {inp.contexte_ao or "(non précisé)"}

## Bibliothèque mémoire de l'utilisateur ({len(inp.bibliotheque)} blocs)
{json.dumps(inp.bibliotheque, ensure_ascii=False, indent=2)}

## Récupère les blocs pertinents (JSON conforme au schéma Output).
Exclus les blocs au corps de métier incompatible (sauf blocs transverses QSE/moyens).
N'invente aucune phrase.
"""
