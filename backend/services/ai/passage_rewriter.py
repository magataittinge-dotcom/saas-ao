"""
Réécriture IA ciblée par passage (C9b) — Sonnet 5.5 (modèle de la génération du mémoire).

Décision du 4/11 (recette Ozcan) : la réécriture quitte Opus 4.7 (~7× plus cher, sans gain visible sur un
passage) pour le modèle qui écrit le mémoire (`memoire_generator.modele_du_segment`, réglage `MEMOIRE_MODELE`).
Opus n'est plus appelé ici. Plafond par jour et par organisation : `routers/memoire.py` (REECRIRE_MAX_PAR_JOUR).

Réécrit UNIQUEMENT le passage sélectionné dans l'éditeur mémoire ; le reste
du document n'est jamais touché. L'endpoint retourne l'avant/après — c'est
le front qui applique (accepter) ou non (rejeter).

Gotchas respectés (CLAUDE.md) :
  • appel SDK enveloppé dans asyncio.to_thread (WSL2 : famine d'event-loop)
  • PAS de `temperature` (refusée par Opus 4.7 → 400 ; jamais transmise, quel que soit le modèle)
  • Sonnet 5.x réfléchit par défaut : réflexion coupée par `between_tools` (comme la génération)

DTU (décision de Mohamed du 27/10, « une seule règle partout où l'IA écrit le
mémoire ») : la réécriture reçoit la même liste fermée que la génération et sa
sortie passe par le même garde-fou déterministe (`RegleDtu`).
"""
import asyncio
import logging
from typing import Optional

from services.ai.dtu_autorises import RegleDtu

logger = logging.getLogger(__name__)

MAX_PASSAGE_CHARS = 6000

ACTIONS = {
    "reformuler": "Reformule ce passage en gardant strictement le même sens et les mêmes faits.",
    "plus_technique": (
        "Réécris ce passage avec un vocabulaire technique BTP plus précis "
        "(procédés, normes DTU pertinentes si déjà évoquées, terminologie métier). "
        "N'ajoute AUCUN fait nouveau."
    ),
    "plus_concis": "Réécris ce passage de façon plus concise, sans perdre aucune information.",
    "insister": "Réécris ce passage en insistant sur : {instruction}. N'invente aucun fait.",
}

_SYSTEM = """Tu réécris un passage d'un mémoire technique de réponse à un appel d'offres BTP.

Règles STRICTES :
- Tu retournes UNIQUEMENT le passage réécrit, sans préambule, sans guillemets, sans commentaire.
- Tu n'inventes JAMAIS de fait, chiffre, référence ou moyen qui n'est pas déjà dans le passage.
- Tu ne donnes JAMAIS de conseil, commentaire ou estimation de PRIX ou de CHIFFRAGE
  (frontière absolue : le chiffrage relève de la seule responsabilité de l'entreprise).
- Tu ne cites un DTU que s'il figure dans la LISTE DES DTU AUTORISÉS donnée avec le passage ;
  sinon tu écris « règles de l'art » sans numéro. Être dans la liste autorise à citer, pas à ajouter.
- Tu conserves le format (Markdown si le passage en contient).
- Tu écris en français professionnel BTP."""


def modele_de_reecriture() -> str:
    """Le modèle de la réécriture : celui de la génération du mémoire (`MEMOIRE_MODELE` le force)."""
    from services.ai.memoire_generator import modele_du_segment
    return modele_du_segment("partie_b")


def _call_modele(passage: str, action: str, instruction: Optional[str],
                 consigne_dtu: str = "") -> str:
    """Un appel synchrone au modèle de la génération — isolé pour les tests (mock) et to_thread."""
    import anthropic
    from config import get_settings

    consigne = ACTIONS[action]
    if action == "insister":
        consigne = consigne.format(instruction=instruction)

    modele = modele_de_reecriture()
    # Jamais de `temperature`. Sonnet 5.x : la réflexion par défaut est coupée (`disabled` → 400, `between_tools` accepté).
    extra = ({"extra_body": {"thinking": {"type": "between_tools"}}}
             if modele.startswith("claude-sonnet-5") else {})
    client = anthropic.Anthropic(api_key=get_settings().ANTHROPIC_API_KEY)
    response = client.messages.create(
        model=modele,
        max_tokens=max(1024, min(len(passage) * 2, 8000)),
        system=_SYSTEM,
        messages=[{
            "role": "user",
            "content": f"{consigne}\n\n{consigne_dtu}\n\nPassage :\n{passage}" if consigne_dtu
                       else f"{consigne}\n\nPassage :\n{passage}",
        }],
        **extra,
    )
    return "".join(b.text for b in response.content if hasattr(b, "text")).strip()


async def rewrite_passage(passage: str, action: str, instruction: Optional[str],
                          regle: RegleDtu) -> str:
    """Réécrit le passage (async-safe : SDK dans un thread), puis retire de la sortie
    tout DTU hors de la liste autorisée du lot (jamais remplacé par un autre DTU)."""
    brut = await asyncio.to_thread(_call_modele, passage, action, instruction, regle.consigne())
    texte, retires = regle.garde_texte(brut)
    if retires:
        logger.info("Réécriture : %d citation(s) de DTU retirée(s) (%s)", len(retires), ", ".join(retires))
    return texte
