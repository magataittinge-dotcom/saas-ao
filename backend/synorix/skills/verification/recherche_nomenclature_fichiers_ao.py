"""Skill #66 — recherche-nomenclature-fichiers-ao.

Propose et valide la nomenclature des fichiers du ZIP final selon le RC et la
plateforme (caractères proscrits, longueur ≤ 30, chemin ≤ 150, format Societe_TypePiece).

Modèle : Haiku 4.5 (normalisation/validation sur signal fort).
Source : NotebookLM N5 (Plateformes) — règles de nommage.
Raw extract: docs/notebook-extracts/skill-66-67-85-nommage-depot-daj-raw.md
System prompt: prompts/recherche_nomenclature_fichiers_ao.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    nom_entreprise: str = ""
    pieces: list[str] = Field(default_factory=list)  # libellés des pièces du dossier
    convention_rc: str = ""  # nomenclature imposée par le RC, si connue


class FichierNormalise(BaseModel):
    libelle_piece: str
    nom_propose: str
    alertes: list[str] = Field(default_factory=list)


class Output(SkillOutput):
    fichiers_normalises: list[FichierNormalise]
    regles_appliquees: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RechercheNomenclatureFichiersAo(Skill):
    name = "recherche-nomenclature-fichiers-ao"
    category = "verification"
    model = "claude-haiku-4-5"
    version = "1"
    system_prompt_path = "prompts/recherche_nomenclature_fichiers_ao.md"

    notebook_sources = ["N5"]
    pipeline_step = 5
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        pieces = "\n".join(f"- {p}" for p in inp.pieces) or "(aucune)"
        entreprise = inp.nom_entreprise or "[À COMPLÉTER PAR L'ENTREPRISE]"
        convention = inp.convention_rc or "(non précisée)"
        user_prompt = (
            f"## Entreprise : {entreprise}\n"
            f"## Convention RC : {convention}\n"
            f"## Pièces du dossier\n{pieces}\n\n"
            "## Normalise les noms de fichiers (JSON conforme au schéma Output)."
        )
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=user_prompt,
            schema=Output,
        )
        return Output.model_validate(raw)
