"""S-10 (audit de sécurité, P2) — Redis injoignable : le limiteur se replie en mémoire au lieu de tout laisser passer
(l'API tourne avec un seul processus : le repli local suffit). Aucun Redis réel."""
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded


def test_redis_injoignable_la_limite_s_applique_quand_meme():
    from services.rate_limit import LimiteurResilient, org_or_ip_key, limiter
    from slowapi.middleware import SlowAPIMiddleware

    limite = LimiteurResilient(key_func=org_or_ip_key, default_limits=["600/minute"],
                               storage_uri="redis://127.0.0.1:1/0", swallow_errors=True, headers_enabled=False,
                               in_memory_fallback_enabled=True)
    mini = FastAPI()
    mini.state.limiter = limite
    mini.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    mini.add_middleware(SlowAPIMiddleware)

    @mini.post("/analyze")
    @limite.limit("5/minute")
    def analyse(request: Request):
        return {"ok": True}

    c = TestClient(mini, raise_server_exceptions=False)
    codes = [c.post("/analyze").status_code for _ in range(6)]
    assert codes == [200] * 5 + [429], codes
    assert limiter._in_memory_fallback_enabled, "le limiteur de l'appli doit avoir le repli en mémoire"
