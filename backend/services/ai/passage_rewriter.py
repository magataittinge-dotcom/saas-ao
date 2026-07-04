"""
Réécriture IA ciblée par passage (C9b) — Opus 4.7.

Réécrit UNIQUEMENT le passage sélectionné dans l'éditeur mémoire ; le reste
du document n'est jamais touché. L'endpoint retourne l'avant/après — c'est
le front qui applique (accepter) ou non (rejeter).

Gotchas respectés (CLAUDE.md) :
  • appel SDK enveloppé dans asyncio.to_thread (WSL2 : famine d'event-loop)
  • PAS de temperature pour claude-opus-4-7 (déprécié → 400)
"""
import asyncio
import logging
from typing import Optional

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
- Tu conserves le format (Markdown si le passage en contient).
- Tu écris en français professionnel BTP."""


def _call_opus(passage: str, action: str, instruction: Optional[str]) -> str:
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
            "content": f"{consigne}\n\nPassage :\n{passage}",
        }],
    )
    return "".join(b.text for b in response.content if hasattr(b, "text")).strip()


async def rewrite_passage(passage: str, action: str, instruction: Optional[str] = None) -> str:
    """Réécrit le passage (async-safe : SDK dans un thread)."""
    return await asyncio.to_thread(_call_opus, passage, action, instruction)
