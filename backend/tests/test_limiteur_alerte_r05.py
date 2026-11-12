"""R-05 (audit données, solidité, coûts) — Redis arrêté : le limiteur se replie en mémoire (S-10) ET le dit au journal.

Avant : la seule trace était un avertissement du journal `slowapi` (muet par défaut : gestionnaire « trou noir »), et
rien ne disait le retour du stockage. Maintenant : une ligne d'alerte (niveau ERROR, journal `services.rate_limit`) à
la première erreur, une seule tant que la panne dure, sans aucune donnée personnelle (ni adresse IP, ni organisation,
ni chemin). Le client honnête n'est pas arrêté ; la route coûteuse garde sa limite (compteur en mémoire du processus).
Aucun Redis réel (port 1 : connexion refusée)."""
import logging

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded


def _appli():
    from services.rate_limit import LimiteurResilient, LimiteGlobaleMiddleware, org_or_ip_key

    limite = LimiteurResilient(key_func=org_or_ip_key, default_limits=["600/minute"],
                               storage_uri="redis://127.0.0.1:1/0", swallow_errors=True, headers_enabled=False,
                               in_memory_fallback_enabled=True)
    mini = FastAPI()
    mini.state.limiter = limite
    mini.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    mini.add_middleware(LimiteGlobaleMiddleware)

    @mini.post("/api/projects/p1/analyze")
    @limite.limit("3/minute")
    def analyse(request: Request):
        return {"ok": True}

    @mini.get("/api/projects")
    def liste(request: Request):
        return {"ok": True}
    return mini, limite


def test_redis_arrete_une_seule_alerte_sans_donnee_personnelle(caplog):
    mini, _ = _appli()
    c = TestClient(mini, raise_server_exceptions=False)
    with caplog.at_level(logging.INFO):
        lectures = [c.get("/api/projects", headers={"X-Forwarded-For": "203.0.113.7"}).status_code for _ in range(5)]
        couteuses = [c.post("/api/projects/p1/analyze").status_code for _ in range(4)]
    assert lectures == [200] * 5                       # le client honnête n'est pas arrêté
    assert couteuses == [200, 200, 200, 429]           # repli sûr : la route coûteuse garde sa limite
    alertes = [r for r in caplog.records if r.name == "services.rate_limit" and r.levelno >= logging.ERROR]
    assert len(alertes) == 1, [r.getMessage() for r in alertes]
    texte = alertes[0].getMessage()
    assert "mémoire" in texte
    for interdit in ("203.0.113.7", "testclient", "org:", "/api/", "p1"):
        assert interdit not in texte


def test_retour_du_stockage_journalise(caplog):
    mini, limite = _appli()
    c = TestClient(mini, raise_server_exceptions=False)
    with caplog.at_level(logging.INFO):
        c.get("/api/projects")
        assert limite._storage_dead
        # Redis revient : simulé par un stockage qui répond (mémoire), vérifié au prochain passage.
        from limits.storage import MemoryStorage
        from limits.strategies import FixedWindowRateLimiter
        limite._storage = MemoryStorage()
        limite._limiter = FixedWindowRateLimiter(limite._storage)
        limite._Limiter__should_check_backend = lambda: True
        assert c.get("/api/projects").status_code == 200
        assert not limite._storage_dead
        assert c.get("/api/projects").status_code == 200
    retours = [r for r in caplog.records if r.name == "services.rate_limit" and "rétabli" in r.getMessage()]
    assert len(retours) == 1
