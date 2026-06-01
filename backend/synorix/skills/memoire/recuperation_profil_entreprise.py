"""Skill #36 — recuperation-profil-entreprise.

Récupère et normalise les données de la rubrique `Mon entreprise` en un profil
canonique prêt à pré-remplir le mémoire technique (identité, chiffres clés,
activités, organigramme, certifications, assurances, références).

Modèle : Haiku 4.5 (mapping/normalisation, pas de génération long-form).
Source : NotebookLM N3 (Mémoires gagnants) — rubriques canoniques + ordre.
Raw extract: docs/notebook-extracts/skill-36-recuperation-profil-entreprise-raw.md
System prompt: prompts/recuperation_profil_entreprise.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    user_id: int
    # Données brutes de la rubrique "Mon entreprise" (clés/casse variables).
    raw_company_data: dict = Field(default_factory=dict)


class Identite(BaseModel):
    raison_sociale: str
    forme_juridique: str
    siret: str
    dirigeant: str
    coordonnees: str
    implantation: str


class ChiffresCles(BaseModel):
    ca_n1: str
    ca_n2: str
    ca_n3: str
    effectif_global: str
    chantiers_par_an: str


class Activites(BaseModel):
    specialisations: list[str]
    histoire_valeurs: str


class Certification(BaseModel):
    libelle: str
    numero: str
    validite: str


class Assurance(BaseModel):
    type: str
    reference: str
    validite: str


class CompanyProfile(BaseModel):
    identite: Identite
    chiffres_cles: ChiffresCles
    activites: Activites
    organigramme: str
    certifications: list[Certification]
    assurances: list[Assurance]
    references_disponibles: str


class Output(SkillOutput):
    profil: CompanyProfile
    champs_manquants: list[str] = Field(default_factory=list)
    ordre_rubriques: list[str]


@register
class RecuperationProfilEntreprise(Skill):
    name = "recuperation-profil-entreprise"
    category = "memoire"
    model = "claude-haiku-4-5"
    version = "1"
    system_prompt_path = "prompts/recuperation_profil_entreprise.md"

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

        return f"""## Données brutes de la rubrique "Mon entreprise" (user_id={inp.user_id})
{json.dumps(inp.raw_company_data, ensure_ascii=False, indent=2)}

## Normalise ces données en profil canonique JSON conforme au schéma Output.
Tout champ canonique absent → "[À COMPLÉTER PAR L'ENTREPRISE]" + ajout dans champs_manquants.
N'invente ni ne paraphrase aucune valeur.
"""
