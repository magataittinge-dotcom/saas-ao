"""
Reformulation du texte libre du profil (C7) — Haiku 4.5.

L'utilisateur décrit ses moyens/équipe/activité en langage libre ; Haiku
structure vers les champs du profil. Le résultat est une PROPOSITION
(preview) que l'utilisateur valide/édite — jamais d'écriture directe.

Anti-invention à deux étages :
  1. Prompt strict (n'extraire QUE ce qui est écrit).
  2. Garde DÉTERMINISTE post-modèle : toute valeur dont les termes
     significatifs (mots > 3 lettres, nombres) ne sont pas retrouvés dans
     le texte saisi est écartée et loggée.

Coût loggé à chaque appel (Haiku ≈ fraction de centime par structuration).
"""
import asyncio
import json
import logging
import re
import unicodedata
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

_MODEL = "claude-haiku-4-5-20251001"
MAX_TEXT_CHARS = 8000

# Tarif Haiku 4.5 (USD / Mtoken) — pour le log de coût uniquement.
_PRICE_INPUT_PER_MTOK = 1.00
_PRICE_OUTPUT_PER_MTOK = 5.00

# Champs de profil que la structuration peut proposer (whitelist).
STRUCTURABLE_FIELDS = {
    "activites", "zone_intervention", "historique",
    "organigramme_description", "moyens_informatiques",
    "vehicules", "materiel", "demarche_qualite",
}

_SYSTEM = """Tu structures la description libre d'une entreprise BTP vers des champs de profil.

Champs possibles (n'utilise QUE ceux-ci, omets ceux sans information) :
activites, zone_intervention, historique, organigramme_description,
moyens_informatiques, vehicules, materiel, demarche_qualite.

RÈGLES ABSOLUES :
- Tu n'extrais QUE des informations PRÉSENTES dans le texte. Tu n'ajoutes,
  ne complètes, ne devines RIEN (aucune certification, chiffre, matériel ou
  zone qui n'est pas écrit).
- Un champ sans information dans le texte → tu l'OMETS (pas de null, pas de
  valeur générique).
- Tu reformules proprement (orthographe, ponctuation) sans changer les faits.
Réponds UNIQUEMENT avec un objet JSON."""


def _call_haiku(text: str) -> Tuple[dict, dict]:
    """Un appel Haiku — isolé pour les tests. Retourne (champs, usage)."""
    import anthropic
    from json_repair import repair_json
    from config import get_settings

    client = anthropic.Anthropic(api_key=get_settings().ANTHROPIC_API_KEY)
    response = client.messages.create(
        model=_MODEL,
        max_tokens=1500,
        system=_SYSTEM,
        messages=[{"role": "user", "content": f"Description :\n{text}"}],
    )
    raw = "".join(b.text for b in response.content if hasattr(b, "text"))
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    fields = json.loads(repair_json(m.group(0))) if m else {}
    usage = getattr(response, "usage", None)
    return (
        fields if isinstance(fields, dict) else {},
        {
            "input_tokens": getattr(usage, "input_tokens", 0) if usage else 0,
            "output_tokens": getattr(usage, "output_tokens", 0) if usage else 0,
        },
    )


def _norm(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", (text or "").lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


# « un chariot » → « 1 chariot » est une reformulation, pas une invention.
_FR_NUMBER_WORDS = {
    "0": "zero", "1": "un", "2": "deux", "3": "trois", "4": "quatre",
    "5": "cinq", "6": "six", "7": "sept", "8": "huit", "9": "neuf",
    "10": "dix", "11": "onze", "12": "douze",
}


def _value_grounded_in_text(value: str, source_norm: str) -> bool:
    """Garde anti-invention : les termes significatifs de la valeur (mots
    > 3 lettres et nombres) doivent tous exister dans le texte saisi —
    un chiffre compte présent si son équivalent en lettres l'est."""
    tokens = re.findall(r"[a-z0-9]+", _norm(value))
    significant = [t for t in tokens if len(t) > 3 or t.isdigit()]
    if not significant:
        return True
    for t in significant:
        if t in source_norm:
            continue
        word = _FR_NUMBER_WORDS.get(t)
        if word and re.search(rf"\b(?:{word}|une)\b" if t == "1" else rf"\b{word}\b", source_norm):
            continue
        return False
    return True


async def structure_profile_text(text: str) -> Tuple[dict, dict]:
    """Texte libre → (champs proposés filtrés, usage+coût). Async-safe."""
    fields, usage = await asyncio.to_thread(_call_haiku, text)

    source_norm = _norm(text)
    proposed: dict = {}
    for key, value in fields.items():
        if key not in STRUCTURABLE_FIELDS:
            logger.warning("structure-text : champ hors whitelist écarté : %r", key)
            continue
        if not isinstance(value, str) or not value.strip():
            continue
        if not _value_grounded_in_text(value, source_norm):
            logger.warning(
                "structure-text : valeur inventée écartée (%s) : %r", key, value[:80],
            )
            continue
        proposed[key] = value.strip()

    cost_usd = (
        usage["input_tokens"] / 1_000_000 * _PRICE_INPUT_PER_MTOK
        + usage["output_tokens"] / 1_000_000 * _PRICE_OUTPUT_PER_MTOK
    )
    usage_out = {**usage, "cost_usd": round(cost_usd, 6)}
    logger.info(
        "structure-text : %d champs proposés, in=%d out=%d tokens, coût=%.6f USD",
        len(proposed), usage["input_tokens"], usage["output_tokens"], cost_usd,
    )
    return proposed, usage_out
