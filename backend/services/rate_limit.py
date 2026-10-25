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
from fastapi.routing import iter_route_contexts
from slowapi import Limiter
from slowapi.middleware import (
    SlowAPIMiddleware,
    _find_route_handler,
    _should_exempt,
    sync_check_limits,
)
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


def endpoint_de_la_requete(app, scope):
    """Endpoint de la route qui servira la requête, routeurs inclus compris.

    slowapi 0.1.9 cherche la route dans `app.routes`. Depuis FastAPI 0.137,
    `app.routes` est un arbre : chaque routeur inclus y figure comme un seul
    objet, sans `endpoint`. slowapi ne trouvait plus 87 des 93 routes, et une
    route non trouvée est exemptée : la limite globale ne s'appliquait plus à
    aucune route des routeurs. `iter_route_contexts` (API publique de FastAPI
    depuis 0.137.2) rend la liste aplatie, avec `matches()` et `endpoint`."""
    return _find_route_handler(iter_route_contexts(app.routes), scope)


class LimiteGlobaleMiddleware(SlowAPIMiddleware):
    """`SlowAPIMiddleware` (slowapi 0.1.9), avec la recherche de route
    ci-dessus. Le reste est identique : route exemptée ou décorée → laissée au
    décorateur ; sinon limite globale (`default_limits`)."""

    async def dispatch(self, request, call_next):
        app = request.app
        limiter_app = app.state.limiter
        if not limiter_app.enabled:
            return await call_next(request)

        handler = endpoint_de_la_requete(app, request.scope)
        if _should_exempt(limiter_app, handler):
            return await call_next(request)

        error_response, should_inject_headers = sync_check_limits(
            limiter_app, request, handler, app
        )
        if error_response is not None:
            return error_response

        response = await call_next(request)
        if should_inject_headers:
            response = limiter_app._inject_headers(response, request.state.view_rate_limit)
        return response
