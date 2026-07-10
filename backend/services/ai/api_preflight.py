"""
Garde pré-vol du service IA (audit risque #4).

Un run condamné d'avance (API Claude injoignable, crédit épuisé) ne démarre
JAMAIS : ping minimal (1 token Haiku, coût négligeable) AVANT tout lancement
d'analyse ou de génération — donc AVANT toute consommation de quota.

Un ping OK est mis en cache (_CACHE_TTL_OK) : pas de latence ni de coût par
run en régime nominal. Un KO n'est jamais mis en cache : le prochain run
re-vérifie et se rétablit aussitôt que le service revient.
"""
import logging
import threading
import time

logger = logging.getLogger(__name__)

_PING_MODEL = "claude-haiku-4-5-20251001"
_CACHE_TTL_OK = 120.0  # un ping OK vaut 2 minutes

_cache = {"ts": 0.0, "ok": False}
_lock = threading.Lock()


class AIServiceUnavailable(Exception):
    """L'API Claude ne peut pas servir un run (panne, crédit épuisé...)."""


def _ping() -> None:
    """Appel minimal — lève l'erreur SDK réelle si le service ne peut pas
    servir (auth, crédit, 5xx, réseau). 1 token de sortie max."""
    import anthropic
    from config import get_settings

    client = anthropic.Anthropic(
        api_key=get_settings().ANTHROPIC_API_KEY,
        max_retries=1,
        timeout=15.0,
    )
    client.messages.create(
        model=_PING_MODEL,
        max_tokens=1,
        messages=[{"role": "user", "content": "ping"}],
    )


def ensure_ai_service_available() -> None:
    """Lève AIServiceUnavailable si l'API Claude ne peut pas servir un run.

    Appel BLOQUANT (réseau) — côté endpoint async, l'envelopper dans
    asyncio.to_thread (règle WSL2 : jamais de SDK dans l'event-loop)."""
    now = time.monotonic()
    with _lock:
        if _cache["ok"] and now - _cache["ts"] < _CACHE_TTL_OK:
            return
    try:
        _ping()
    except Exception as exc:
        logger.error("Pré-vol IA KO : %s", exc)
        with _lock:
            _cache.update(ts=now, ok=False)
        raise AIServiceUnavailable(str(exc)) from exc
    with _lock:
        _cache.update(ts=now, ok=True)
