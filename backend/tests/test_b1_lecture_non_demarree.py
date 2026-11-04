"""B1 (recette Ozcan) — si le lancement de la lecture échoue, l'AO ne passe pas à l'étape suivante.

Avant : `lots/select` avançait `current_step` à 3 et cochait l'étape Lots AVANT le lancement ; un pré-vol IA en échec
(503) laissait l'AO sur « Décider » avec un « 0 % » sans fin alors que rien ne tournait.
Maintenant : le choix des lots est seulement enregistré ; l'étape avance quand la lecture est effectivement lancée.
"""
import threading

from models.project import Project, ProjectDocument


def _projet(db, org_id, pid):
    db.add(Project(id=pid, organization_id=org_id, name="AO neuf", current_step=2,
                   completed_steps={"1": True}))
    db.add(ProjectDocument(project_id=pid, type="rc", file_url="x", file_name="rc.pdf",
                           extracted_text="Règlement de consultation. " * 30))
    db.commit()


def _ia_indisponible(monkeypatch):
    from services.ai import api_preflight

    def _boom():
        raise RuntimeError("credit balance is too low")
    monkeypatch.setattr(api_preflight, "_ping", _boom)
    api_preflight._cache.update(ts=0.0, ok=False)


def _etat(db, pid):
    db.expire_all()
    p = db.get(Project, pid)
    return p.current_step, dict(p.completed_steps or {}), p.processing_status


def test_choisir_un_lot_n_avance_pas_l_etape(client, db_session, test_org):
    _projet(db_session, test_org.id, "p-b1-a")
    r = client.post("/api/projects/p-b1-a/lots/select", json={"lot_id": "lot1", "lot_name": "Lot 1"})
    assert r.status_code == 200
    etape, faites, _ = _etat(db_session, "p-b1-a")
    assert etape == 2
    assert "2" not in faites
    assert db_session.get(Project, "p-b1-a").selected_lot == "lot1"


def test_lecture_en_echec_ne_fait_pas_avancer_l_etape(client, db_session, test_org, monkeypatch):
    """Parcours réel de l'écran Lots : choix du lot, puis lancement qui échoue (503)."""
    _projet(db_session, test_org.id, "p-b1-b")
    _ia_indisponible(monkeypatch)
    assert client.post("/api/projects/p-b1-b/lots/select",
                       json={"lot_id": "lot1", "lot_name": "Lot 1"}).status_code == 200
    r = client.post("/api/projects/p-b1-b/analyze")
    assert r.status_code == 503
    etape, faites, statut = _etat(db_session, "p-b1-b")
    assert etape == 2, "l'AO doit rester sur l'étape Lots"
    assert "2" not in faites, "l'étape Lots ne doit pas être cochée"
    assert statut != "analyzing"


def test_lecture_lancee_fait_avancer_l_etape(client, db_session, test_org, monkeypatch):
    from services.ai import dce_analyzer, checklist_matcher

    _projet(db_session, test_org.id, "p-b1-c")

    def _passe(self, *a, **kw):
        return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _passe)

    async def _rien(self, *a, **kw):
        return []
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _rien)

    client.post("/api/projects/p-b1-c/lots/select", json={"lot_id": "lot1", "lot_name": "Lot 1"})
    assert client.post("/api/projects/p-b1-c/analyze").status_code == 200
    for t in threading.enumerate():
        if t.name.startswith("synorix-analysis-"):
            t.join(timeout=30)
    etape, faites, _ = _etat(db_session, "p-b1-c")
    assert etape >= 3
    assert faites.get("2") is True
