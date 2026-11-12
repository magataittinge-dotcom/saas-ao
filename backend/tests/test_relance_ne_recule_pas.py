"""RESTES-2, point 9 — lancer une analyse ne fait jamais reculer un AO.

Avant : `routers/analysis.py` remettait `current_step` à 3 sans condition au lancement ; un AO déjà à l'étape 5 ou 6
(mémoire, export) qui relançait la lecture d'un lot revenait à l'étape 3, puis 4 à la fin de la lecture.
Maintenant : `max(current_step, 3)`. Un AO neuf passe toujours à 3. Textes inventés.
"""
import threading

import pytest

from models.project import Project, ProjectDocument


def _projet(db, org_id, pid, etape, faites):
    db.add(Project(id=pid, organization_id=org_id, name="AO inventé", current_step=etape, completed_steps=faites))
    db.add(ProjectDocument(project_id=pid, type="rc", file_url="x", file_name="rc.pdf",
                           extracted_text="Règlement de consultation inventé. " * 30))
    db.commit()


@pytest.fixture
def lecture_sans_ia(monkeypatch):
    """La lecture tourne sans appel d'IA ; l'étape est relevée au moment exact du lancement (après le commit)."""
    from database import SessionLocal
    from routers import analysis
    from services.ai import checklist_matcher, dce_analyzer

    def _passe(self, *a, **kw):
        return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _passe)

    async def _rien(self, *a, **kw):
        return []
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _rien)

    au_lancement: dict[str, int] = {}
    vrai = analysis.pipeline_tracker.start_pipeline

    def _releve(project_id, *a, **kw):
        s = SessionLocal()
        try:
            au_lancement[project_id] = s.get(Project, project_id).current_step
        finally:
            s.close()
        return vrai(project_id, *a, **kw)
    monkeypatch.setattr(analysis.pipeline_tracker, "start_pipeline", _releve)
    return au_lancement


def _attendre_les_lectures():
    for t in threading.enumerate():
        if t.name.startswith("synorix-analysis-"):
            t.join(timeout=30)


def _etape(db, pid):
    db.expire_all()
    return db.get(Project, pid).current_step


def test_relancer_un_lot_d_un_ao_a_l_etape_6_le_laisse_a_6(client, db_session, test_org, lecture_sans_ia):
    faites = {str(i): True for i in range(1, 6)}
    _projet(db_session, test_org.id, "p-relance-6", 6, faites)
    assert client.post("/api/projects/p-relance-6/analyze").status_code == 200
    assert lecture_sans_ia["p-relance-6"] == 6, "au lancement, l'AO reste à l'étape 6"
    _attendre_les_lectures()
    assert _etape(db_session, "p-relance-6") == 6, "la lecture finie ne le fait pas reculer non plus"


def test_relancer_depuis_l_etape_5_le_laisse_a_5(client, db_session, test_org, lecture_sans_ia):
    _projet(db_session, test_org.id, "p-relance-5", 5, {str(i): True for i in range(1, 5)})
    assert client.post("/api/projects/p-relance-5/analyze").status_code == 200
    assert lecture_sans_ia["p-relance-5"] == 5
    _attendre_les_lectures()
    assert _etape(db_session, "p-relance-5") == 5


def test_un_ao_neuf_passe_a_l_etape_3_au_lancement(client, db_session, test_org, lecture_sans_ia):
    _projet(db_session, test_org.id, "p-neuf", 2, {"1": True})
    assert client.post("/api/projects/p-neuf/analyze").status_code == 200
    assert lecture_sans_ia["p-neuf"] == 3
    _attendre_les_lectures()
    assert _etape(db_session, "p-neuf") >= 3
