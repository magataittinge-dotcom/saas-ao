"""S-07 (audit de sécurité, P1) — GET /api/rag/retrieve n'est plus servie : elle déclenchait deux appels Voyage payants
(vecteur + reclassement) pour tout compte connecté, sans plafond, et aucun écran ne s'en sert."""
from pathlib import Path


def test_la_recherche_rag_n_est_plus_publique(client, monkeypatch):
    import services.rag.retriever as rr
    appels = []
    monkeypatch.setattr(rr, "retrieve", lambda *a, **k: appels.append(1) or [], raising=False)
    r = client.get("/api/rag/retrieve", params={"q": "retenue de garantie"})
    assert r.status_code == 404 and appels == []


def test_le_fichier_du_routeur_reste():
    assert (Path(__file__).resolve().parents[1] / "routers" / "rag.py").exists()
