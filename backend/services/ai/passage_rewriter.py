"""
Réécriture IA ciblée par passage (C9b) — Opus 4.7.

Réécrit UNIQUEMENT le passage sélectionné dans l'éditeur mémoire ; le reste
du document n'est jamais touché. L'endpoint retourne l'avant/après — c'est
le front qui applique (accepter) ou non (rejeter).

Gotchas respectés (CLAUDE.md) :
  • appel SDK enveloppé dans asyncio.to_thread (WSL2 : famine d'event-loop)
  • PAS de temperature pour claude-opus-4-7 (déprécié → 400)

DTU (décision de Mohamed du 27/10, « une seule règle partout où l'IA écrit le
mémoire ») : la réécriture reçoit la même liste fermée que la génération et sa
sortie passe par le même garde-fou déterministe (`RegleDtu`).
"""
import asyncio
import logging
from typing import Optional

from services.ai.dtu_autorises import RegleDtu

logger = logging.getLogger(__name__)

_MODEL = "claude-opus-4-7"
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


def _call_opus(passage: str, action: str, instruction: Optional[str],
               consigne_dtu: str = "") -> str:
    """Un appel Opus synchrone — isolé pour les tests (mock) et to_thread."""
    import anthropic
    from config import get_settings

    consigne = ACTIONS[action]
    if action == "insister":
        consigne = consigne.format(instruction=instruction)

    client = anthropic.Anthropic(api_key=get_settings().ANTHROPIC_API_KEY)
    response = client.messages.create(
        model=_MODEL,
        max_tokens=max(1024, min(len(passage) * 2, 8000)),
        system=_SYSTEM,
        messages=[{
            "role": "user",
            "content": f"{consigne}\n\n{consigne_dtu}\n\nPassage :\n{passage}" if consigne_dtu
                       else f"{consigne}\n\nPassage :\n{passage}",
        }],
    )
    return "".join(b.text for b in response.content if hasattr(b, "text")).strip()


async def rewrite_passage(passage: str, action: str, instruction: Optional[str],
                          regle: RegleDtu) -> str:
    """Réécrit le passage (async-safe : SDK dans un thread), puis retire de la sortie
    tout DTU hors de la liste autorisée du lot (jamais remplacé par un autre DTU)."""
    brut = await asyncio.to_thread(_call_opus, passage, action, instruction, regle.consigne())
    texte, retires = regle.garde_texte(brut)
    if retires:
        logger.info("Réécriture : %d citation(s) de DTU retirée(s) (%s)", len(retires), ", ".join(retires))
    return texte
