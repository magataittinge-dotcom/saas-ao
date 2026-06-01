"""Skill #40 — redacteur-preambule.

Rédige le préambule du mémoire technique (≈ 1 page) : contexte de la candidature,
engagement de l'entreprise, esprit du document — adapté au projet/MOA/lot.

Modèle : Opus 4.7 (rédaction long-form, différenciateur produit — qualité prioritaire).
Source : NotebookLM N3 (Mémoires gagnants) — structure 4 mouvements, formulations gagnantes.
Raw extract: docs/notebook-extracts/skill-40-redacteur-preambule-raw.md
System prompt: prompts/redacteur_preambule.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class DonneesAO(BaseModel):
    nom_chantier: str
    moa: str | None = None
    lot: str | None = None
    enjeux_identifies: list[str] = Field(default_factory=list)
    visite_site: str | None = None  # date/observations si visite effectuée


class Input(SkillInput):
    profil_entreprise: dict = Field(default_factory=dict)
    donnees_ao: DonneesAO
    longueur_cible_mots: int = 450
    ton: str = "engagé, factuel"


class SectionMemoire(BaseModel):
    titre: str
    contenu_markdown: str
    longueur_estimee_mots: int


class Output(SkillOutput):
    section: SectionMemoire
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RedacteurPreambule(Skill):
    name = "redacteur-preambule"
    category = "memoire"
    model = "claude-opus-4-7"
    version = "1"
    system_prompt_path = "prompts/redacteur_preambule.md"

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

        ao = inp.donnees_ao
        return f"""## Données de l'AO
- Chantier : {ao.nom_chantier}
- MOA : {ao.moa or "[À COMPLÉTER — donnée DCE]"}
- Lot : {ao.lot or "[À COMPLÉTER — donnée DCE]"}
- Enjeux identifiés : {", ".join(ao.enjeux_identifies) or "(à déduire du CCTP fourni)"}
- Visite de site : {ao.visite_site or "(non mentionnée — ne pas inventer)"}

## Profil entreprise (ne jamais inventer ce qui manque)
{json.dumps(inp.profil_entreprise, ensure_ascii=False, indent=2)}

## Paramètres
- Longueur cible : ~{inp.longueur_cible_mots} mots
- Ton : {inp.ton}

## Rédige le préambule (JSON conforme au schéma Output), adapté à CE projet.
"""
