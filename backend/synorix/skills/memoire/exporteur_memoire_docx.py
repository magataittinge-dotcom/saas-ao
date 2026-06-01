"""Skill #62 — exporteur-memoire-docx.

Produit la spécification de mise en page .docx (charte Synorix inspirée Cariso)
et vérifie les contraintes du RC. Rendu DÉTERMINISTE (model="none", aucun appel LLM) :
charte fixe + contrôle de la limite de pages (alerte bloquante si dépassée).

Modèle : "none" (rendu pur, cf. registry #62).
Source : NotebookLM N3 (Mémoires gagnants) — gras stratégique, listes, limite de pages RC.
Raw extract: docs/notebook-extracts/skill-62-63-exporteurs-raw.md
System prompt (référence, non envoyé) : prompts/exporteur_memoire_docx.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register

# Charte Synorix (déterministe)
CHARTE = {
    "police": "Calibri",
    "taille_corps_pt": 11,
    "taille_titre_pt": 16,
    "marges_cm": 2.0,
    "interligne": 1.15,
    "gras_strategique": True,
    "listes_a_puces": True,
}


class Input(SkillInput):
    sections: list[dict] = Field(default_factory=list)  # mémoire assemblé (titre + contenu)
    limite_pages_rc: int | None = None  # limite imposée par le RC, si connue
    pages_estimees: int | None = None  # estimation du rendu


class Output(SkillOutput):
    charte: dict
    nb_sections: int
    limite_pages_respectee: bool
    alertes: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class ExporteurMemoireDocx(Skill):
    name = "exporteur-memoire-docx"
    category = "memoire"
    model = "none"  # rendu déterministe, aucun appel LLM (cf. registry #62)
    version = "1"
    system_prompt_path = "prompts/exporteur_memoire_docx.md"

    notebook_sources = ["N3"]
    pipeline_step = 4
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        # Aucun appel au client : application déterministe de la charte + contrôle RC.
        alertes: list[str] = []
        limite_ok = True
        if inp.limite_pages_rc is not None and inp.pages_estimees is not None:
            if inp.pages_estimees > inp.limite_pages_rc:
                limite_ok = False
                alertes.append(
                    f"Limite de pages RC dépassée ({inp.pages_estimees} > "
                    f"{inp.limite_pages_rc}) : risque de rejet pour irrégularité. "
                    f"Réduire le contenu avant export."
                )
        elif inp.limite_pages_rc is None:
            alertes.append(
                "[À COMPLÉTER — limite de pages du RC inconnue] : vérifier le CRT / la "
                "limite de pages avant dépôt."
            )

        return Output(
            charte=CHARTE,
            nb_sections=len(inp.sections),
            limite_pages_respectee=limite_ok,
            alertes=alertes,
            sources_nbk=["N3"],
        )
