"""Skill #52 — generateur-photos-references.

Intègre dans le mémoire les photos de chantiers stockées dans "Mes références",
avec légendes annotées. Mise en page DÉTERMINISTE (model="none", aucun appel LLM) :
ratio normalisé, max 3 photos/référence, légende obligatoire (sinon photo rejetée).

Modèle : "none" (rendu visuel pur, cf. registry #52).
Source : NotebookLM N3 (Mémoires gagnants) — la photo illustre, ne substitue pas.
Raw extract: docs/notebook-extracts/skill-52-generateur-photos-references-raw.md
System prompt (référence, non envoyé) : prompts/generateur_photos_references.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register

MAX_PHOTOS_PAR_REFERENCE = 3
RATIO_DEFAUT = "4:3"


class PhotoInput(BaseModel):
    ref_id: str
    url: str
    legende: str = ""
    point_technique: str = ""  # rattachement à un point de méthodologie


class Input(SkillInput):
    photos: list[PhotoInput] = Field(default_factory=list)


class PhotoMiseEnPage(BaseModel):
    ref_id: str
    url: str
    legende: str
    ratio: str


class Output(SkillOutput):
    photos_integrees: list[PhotoMiseEnPage]
    photos_rejetees: list[str] = Field(default_factory=list)  # raison par photo
    sources_nbk: list[str]


@register
class GenerateurPhotosReferences(Skill):
    name = "generateur-photos-references"
    category = "memoire"
    model = "none"  # rendu déterministe, aucun appel LLM (cf. registry #52)
    version = "1"
    system_prompt_path = "prompts/generateur_photos_references.md"

    notebook_sources = ["N3"]
    pipeline_step = 4
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        # Aucun appel au client : mise en page déterministe et vérifiable.
        integrees: list[PhotoMiseEnPage] = []
        rejetees: list[str] = []
        compte_par_ref: dict[str, int] = {}

        for p in inp.photos:
            # Règle N3 : une photo nue (sans légende rattachée à un point technique)
            # ne remplace pas une note technique → rejetée.
            if not p.legende.strip() or not p.point_technique.strip():
                rejetees.append(
                    f"{p.ref_id}/{p.url} : légende ou point technique manquant "
                    f"(la photo doit illustrer la méthodologie, pas la remplacer)"
                )
                continue
            n = compte_par_ref.get(p.ref_id, 0)
            if n >= MAX_PHOTOS_PAR_REFERENCE:
                rejetees.append(
                    f"{p.ref_id}/{p.url} : au-delà de {MAX_PHOTOS_PAR_REFERENCE} photos/référence"
                )
                continue
            compte_par_ref[p.ref_id] = n + 1
            legende = f"{p.legende} — {p.point_technique}"
            integrees.append(
                PhotoMiseEnPage(ref_id=p.ref_id, url=p.url, legende=legende, ratio=RATIO_DEFAUT)
            )

        return Output(
            photos_integrees=integrees,
            photos_rejetees=rejetees,
            sources_nbk=["N3"],
        )
