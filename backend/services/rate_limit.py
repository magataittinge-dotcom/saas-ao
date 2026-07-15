"""Rate limiting partagé (S1.2 — audit sécurité passe 2).

UN SEUL Limiter pour toute l'app. Avant, chaque router créait le sien
(`Limiter(key_func=get_remote_address)`), et main.py posait un
`default_limits` JAMAIS appliqué (pas de SlowAPIMiddleware) → protection
quasi nulle sur les routes chères, compteurs in-memory fragmentés par worker,
et clé = IP (spoofable via X-Forwarded-For derrière un proxy).

Corrections :
- **Clé = org** quand la requête est authentifiée (posée dans `request.state.
  rl_key` par `get_auth_user`), sinon IP. L'org est liée à un JWT validé →
  non spoofable, contrairement au X-Forwarded-For.
- **Stockage Redis en prod** (`storage_uri=REDIS_URL`) → compteurs partagés
  entre les workers gunicorn. En test/DEBUG → mémoire (pas de Redis requis).
- **swallow_errors** : une panne du backend de limitage (Redis down) ne doit
  jamais faire tomber l'app en 5xx — on laisse passer plutôt que bloquer.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from config import get_settings

settings = get_settings()


def org_or_ip_key(request) -> str:
    """Clé de limitage : org authentifiée si dispo, sinon IP.

    `request.state.rl_key` est posée par `routers.auth.get_auth_user(_short)`
    (= ``org:<organization_id>``). Pour les routes publiques (health, webhook
    Stripe), rl_key est absent → repli sur l'adresse IP."""
    key = getattr(getattr(request, "state", None), "rl_key", None)
    if key:
        return key
    return get_remote_address(request)


def _resolve_storage_uri() -> str | None:
    """Redis en prod (compteurs cross-worker) ; mémoire en test/DEBUG."""
    if settings.DEBUG:
        return None
    return settings.REDIS_URL or None


limiter = Limiter(
    key_func=org_or_ip_key,
    default_limits=["600/minute"],
    storage_uri=_resolve_storage_uri(),
    swallow_errors=True,
    # headers_enabled=False : les endpoints renvoient des dicts (pas des
    # Response) ; avec l'injection d'en-têtes activée sur le décorateur,
    # slowapi lèverait. Le 429 sur dépassement suffit à la protection.
    headers_enabled=False,
)
