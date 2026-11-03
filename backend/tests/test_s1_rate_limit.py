"""S1.2 — rate limiting réellement opérant + keyé par org (audit passe 2, 🔴).

Avant : chaque router avait son propre Limiter, le default_limits de main.py
était mort (pas de SlowAPIMiddleware), les clés étaient l'IP (spoofable), et
plusieurs routes chères n'avaient aucune limite. Ici on prouve :
  1. la clé de limitage privilégie l'org (non spoofable) sur l'IP ;
  2. SlowAPIMiddleware est installé (sinon aucune limite ne s'applique) ;
  3. une route chère jadis non limitée (auth/sync) est désormais throttlée ;
  4. les compteurs sont ISOLÉS par org (l'abus d'une org n'affecte pas l'autre).
"""
import pytest
from fastapi import Depends, FastAPI, Header, Request
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from services.rate_limit import _resolve_storage_uri, limiter, org_or_ip_key


class _FakeReq:
    def __init__(self, rl_key=None, host="9.9.9.9"):
        self.state = type("S", (), {})()
        if rl_key:
            self.state.rl_key = rl_key
        self.client = type("C", (), {"host": host})()
        self.headers = {}


@pytest.fixture
def rl_enabled():
    """Réactive le limiter (désactivé par défaut en test via conftest) et
    remet les compteurs à zéro autour du test."""
    prev = limiter.enabled
    limiter.enabled = True
    try:
        limiter.reset()
    except Exception:
        pass
    yield
    limiter.enabled = prev
    try:
        limiter.reset()
    except Exception:
        pass


# ── 1. clé org > IP ───────────────────────────────────────────────────────────

def test_key_func_prefers_org_then_falls_back_to_ip():
    assert org_or_ip_key(_FakeReq(rl_key="org:abc")) == "org:abc"
    assert org_or_ip_key(_FakeReq()) == "9.9.9.9"  # pas d'org → IP


def test_storage_is_memory_in_debug():
    # conftest force DEBUG=true → mémoire (pas de Redis requis en test)
    assert _resolve_storage_uri() is None


# ── 2. middleware installé (sinon default_limits mort) ────────────────────────

def test_slowapi_middleware_is_installed():
    from main import app
    assert any(issubclass(m.cls, SlowAPIMiddleware) for m in app.user_middleware), (
        "SlowAPIMiddleware absent → les limites globales ne s'appliquent pas"
    )


# ── 3. route chère (auth/sync) désormais throttlée ───────────────────────────

def test_auth_sync_is_rate_limited(client, rl_enabled):
    """auth/sync (appel INSEE) n'avait AUCUNE limite. Désormais bornée."""
    got_429 = False
    # au-delà de la limite (10/min) → 429
    for _ in range(15):
        r = client.post("/api/auth/sync", json={})
        if r.status_code == 429:
            got_429 = True
            break
    assert got_429, "auth/sync doit renvoyer 429 une fois la limite dépassée"


# ── 4. isolation par org (l'abus d'une org n'affecte pas l'autre) ────────────

def test_limit_is_isolated_per_org(rl_enabled):
    mini = FastAPI()
    mini.state.limiter = limiter
    mini.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    mini.add_middleware(SlowAPIMiddleware)

    def _set_key(request: Request, x_org: str = Header(None)):
        if x_org:
            request.state.rl_key = f"org:{x_org}"

    @mini.get("/ping", dependencies=[Depends(_set_key)])
    @limiter.limit("3/minute")
    def ping(request: Request):
        return {"ok": True}

    c = TestClient(mini)
    # org A épuise sa limite
    for _ in range(3):
        assert c.get("/ping", headers={"X-Org": "orgA-iso"}).status_code == 200
    assert c.get("/ping", headers={"X-Org": "orgA-iso"}).status_code == 429
    # org B a son propre compteur → pas affectée
    assert c.get("/ping", headers={"X-Org": "orgB-iso"}).status_code == 200


# ── 5. limite globale sur les routes des routeurs inclus (montée FastAPI) ─────

def _middleware_de_limite():
    """La classe de middleware de limitage réellement installée par main.py."""
    from main import app
    return next(m.cls for m in app.user_middleware if issubclass(m.cls, SlowAPIMiddleware))


def test_limite_globale_sur_une_route_d_un_routeur_inclus():
    """Depuis FastAPI 0.137, `app.routes` est un arbre : un routeur inclus y
    figure comme un seul objet, sans `endpoint`. slowapi y cherche la route,
    ne la trouve plus, et une route non trouvée est exemptée : la limite
    globale (S1.2) ne s'appliquait plus à aucune route incluse. Ici, avec une
    limite globale de 2/minute, la 3e requête sur une route sans décorateur
    d'un routeur inclus (comme toutes celles de Synorix) doit renvoyer 429."""
    from fastapi import APIRouter
    from slowapi import Limiter

    limite = Limiter(key_func=org_or_ip_key, default_limits=["2/minute"],
                     headers_enabled=False)
    mini = FastAPI()
    mini.state.limiter = limite
    mini.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    mini.add_middleware(_middleware_de_limite())
    routeur = APIRouter()

    @routeur.get("/{projet}/resume")
    def resume(projet: str):
        return {"projet": projet}

    mini.include_router(routeur, prefix="/api/projets")
    c = TestClient(mini)
    codes = [c.get("/api/projets/p1/resume").status_code for _ in range(3)]
    assert codes == [200, 200, 429], codes


def test_chaque_route_de_l_appli_est_vue_par_la_limite_globale():
    """Aucune route de Synorix n'échappe à la limite globale faute d'être
    trouvée : pour chaque route de l'appli, la recherche du middleware
    renvoie un endpoint (une route non trouvée serait exemptée)."""
    import re

    from fastapi.routing import iter_route_contexts

    from main import app
    from services.rate_limit import endpoint_de_la_requete

    non_vues = []
    for route in iter_route_contexts(app.routes):
        if not route.methods:
            continue
        chemin = re.sub(r"\{[^}]+\}", "1", route.path_format)
        methode = sorted(route.methods - {"HEAD"} or route.methods)[0]
        scope = {"type": "http", "method": methode, "path": chemin, "root_path": "",
                 "query_string": b"", "headers": []}
        if endpoint_de_la_requete(app, scope) is None:
            non_vues.append(f"{methode} {route.path_format}")
    assert not non_vues, f"{len(non_vues)} routes exemptées de la limite globale : {non_vues[:5]}"


# ── 6. panne du stockage du limiteur : la requête passe (nuit du 3/11) ────────

def _mini_app_avec_limite(limite):
    """Petite appli avec le vrai middleware de limitage de Synorix et une route
    protégée (401 sans jeton) à côté d'une route publique (200)."""
    from fastapi import HTTPException

    mini = FastAPI()
    mini.state.limiter = limite
    mini.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    mini.add_middleware(_middleware_de_limite())

    @mini.get("/api/projects")
    def projets():
        raise HTTPException(status_code=401, detail="Non authentifié")

    @mini.get("/api/public")
    def public():
        return {"ok": True}

    return TestClient(mini, raise_server_exceptions=False)


def test_redis_injoignable_ne_donne_pas_de_500():
    """Avec `REDIS_URL` vers un Redis qui ne répond pas, la requête donnait
    500 (`'State' object has no attribute 'view_rate_limit'`) au lieu de
    passer : `swallow_errors` laissait passer la vérification, mais le
    middleware lisait quand même `request.state.view_rate_limit`, jamais posé
    puisque la vérification avait échoué."""
    from services.rate_limit import LimiteurResilient

    limite = LimiteurResilient(key_func=org_or_ip_key, default_limits=["600/minute"],
                     storage_uri="redis://127.0.0.1:1/0", swallow_errors=True,
                     headers_enabled=False)
    c = _mini_app_avec_limite(limite)
    assert c.get("/api/projects").status_code == 401
    assert c.get("/api/public").status_code == 200


@pytest.mark.parametrize("erreur", ["connexion", "authentification"])
def test_erreur_du_stockage_ne_donne_pas_de_500(erreur):
    """Même chose si le stockage lève une erreur de connexion ou de mot de
    passe au moment du comptage (ici simulée sur le stockage réel)."""
    import redis
    from services.rate_limit import LimiteurResilient

    exc = (redis.exceptions.ConnectionError("Connection refused") if erreur == "connexion"
           else redis.exceptions.AuthenticationError("invalid password"))
    limite = LimiteurResilient(key_func=org_or_ip_key, default_limits=["600/minute"],
                     swallow_errors=True, headers_enabled=False)

    def _hit(*a, **k):
        raise exc

    limite.limiter.hit = _hit
    c = _mini_app_avec_limite(limite)
    assert c.get("/api/projects").status_code == 401
    assert c.get("/api/public").status_code == 200


def test_le_limiteur_limite_toujours_quand_le_stockage_marche():
    """Contre-épreuve : le correctif ne désactive pas la limite."""
    from services.rate_limit import LimiteurResilient

    limite = LimiteurResilient(key_func=org_or_ip_key, default_limits=["2/minute"],
                     swallow_errors=True, headers_enabled=False)
    c = _mini_app_avec_limite(limite)
    codes = [c.get("/api/public").status_code for _ in range(3)]
    assert codes == [200, 200, 429], codes


def test_route_decoree_avec_stockage_en_panne_passe_aussi():
    """Les routes à limite propre (`@limiter.limit`, auth/sync, IA…) passent
    aussi quand le stockage lève une erreur."""
    import redis
    from services.rate_limit import LimiteurResilient

    limite = LimiteurResilient(key_func=org_or_ip_key, default_limits=["600/minute"],
                     swallow_errors=True, headers_enabled=False)

    def _hit(*a, **k):
        raise redis.exceptions.ConnectionError("Connection refused")

    limite.limiter.hit = _hit
    mini = FastAPI()
    mini.state.limiter = limite
    mini.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    mini.add_middleware(_middleware_de_limite())

    @mini.get("/chere")
    @limite.limit("3/minute")
    def chere(request: Request):
        return {"ok": True}

    assert TestClient(mini, raise_server_exceptions=False).get("/chere").status_code == 200


def test_appli_reelle_avec_stockage_en_panne(rl_enabled, monkeypatch):
    """Sur l'appli réelle : /api/projects sans jeton -> 401 et /api/health -> 200
    même si le stockage du limiteur lève une erreur."""
    import redis

    from main import app

    def _hit(*a, **k):
        raise redis.exceptions.ConnectionError("Connection refused")

    monkeypatch.setattr(limiter.limiter, "hit", _hit)
    client = TestClient(app, raise_server_exceptions=False)
    assert client.get("/api/projects").status_code == 401
    assert client.get("/api/health").status_code == 200
