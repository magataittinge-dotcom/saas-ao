"""Skill #63 — exporteur-memoire-pdf.

Produit le PDF finalisé prêt pour dépôt et son manifeste de conformité plateforme :
nommage normalisé (Societe_Memoire_technique), contrôle de poids (~30 Mo AWS),
configuration de signature (PAdES, RGS**/eIDAS, signer chaque fichier pas le ZIP).
Rendu DÉTERMINISTE (model="none", aucun appel LLM).

Modèle : "none" (rendu pur, cf. registry #63).
Source : NotebookLM N5 (Plateformes). DPI/PDF-A hors corpus → [À COMPLÉTER].
Raw extract: docs/notebook-extracts/skill-62-63-exporteurs-raw.md
System prompt (référence, non envoyé) : prompts/exporteur_memoire_pdf.md
"""

import re

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register

LIMITE_POIDS_MO_DEFAUT = 30  # limite conseillée AWS (N5)


def _slug(value: str) -> str:
    value = value.strip() or "Societe"
    value = re.sub(r"[^0-9A-Za-zÀ-ÿ]+", "_", value)
    return value.strip("_") or "Societe"


class Input(SkillInput):
    nom_entreprise: str = ""
    poids_mo: float | None = None
    limite_poids_mo: int = LIMITE_POIDS_MO_DEFAUT
    signature_exigee: bool = False
    depose_en_zip: bool = False


class Output(SkillOutput):
    nom_fichier: str
    poids_respecte: bool
    signature_config: dict
    alertes: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class ExporteurMemoirePdf(Skill):
    name = "exporteur-memoire-pdf"
    category = "memoire"
    model = "none"  # rendu déterministe, aucun appel LLM (cf. registry #63)
    version = "1"
    system_prompt_path = "prompts/exporteur_memoire_pdf.md"

    notebook_sources = ["N5"]
    pipeline_step = 4
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        # Aucun appel au client : contrôles de conformité déterministes.
        nom_fichier = f"{_slug(inp.nom_entreprise)}_Memoire_technique.pdf"
        alertes: list[str] = []

        poids_ok = True
        if inp.poids_mo is not None and inp.poids_mo > inp.limite_poids_mo:
            poids_ok = False
            alertes.append(
                f"Poids du PDF ({inp.poids_mo} Mo) > limite plateforme "
                f"({inp.limite_poids_mo} Mo) : compresser / optimiser les images."
            )

        signature_config: dict = {"requise": inp.signature_exigee}
        if inp.signature_exigee:
            signature_config.update(
                {
                    "format": "PAdES",
                    "certificat": "RGS** ou eIDAS qualifié",
                    "regle": "signer individuellement chaque fichier, jamais le seul ZIP",
                }
            )
            if inp.depose_en_zip:
                alertes.append(
                    "Dépôt en ZIP : signer chaque fichier du pli (la signature du ZIP "
                    "seul n'a aucune valeur juridique)."
                )

        alertes.append(
            "[À COMPLÉTER — DPI/PDF-A non spécifiés par les sources ; optimisation "
            "des images recommandée par déduction]"
        )

        return Output(
            nom_fichier=nom_fichier,
            poids_respecte=poids_ok,
            signature_config=signature_config,
            alertes=alertes,
            sources_nbk=["N5"],
        )
