"""D-03 (audit données, P2) — GET /plan-memoire ne relit plus le texte de chaque pièce par une requête à part.

Avant : une requête `SELECT extracted_text` par RC ou CCTP (13 pour « gueux fable », 21 au total). Désormais le
nombre de requêtes ne dépend plus du nombre de pièces, et le plan rendu est identique. Valeurs inventées."""
import pytest
from sqlalchemy import event

from database import engine
from models.project import Project, ProjectDocument

RC = ("Article 5. Le mémoire technique comprendra :\n- la présentation de l'organisation du chantier ;\n"
      "- un zorglub quantique inventé ;\nArticle 6. Jugement.")


@pytest.fixture(autouse=True)
def _pas_de_limite(monkeypatch):
    import routers.plan_memoire as m
    monkeypatch.setattr(m.limiter, "enabled", False, raising=False)


def _projet(db, org_id, pid, nb_pieces):
    db.add(Project(id=pid, organization_id=org_id, name="AO", current_step=4, status="en_cours", selected_lot="lot1",
                   selected_lot_name="Lot 1",
                   processing_status="ready", criteres_jugement=[{"nom": "Valeur technique", "poids": 60}]))
    for i in range(nb_pieces):
        db.add(ProjectDocument(project_id=pid, type="cctp" if i % 2 else "rc", file_url="x",
                               file_name=f"piece-{i}.pdf", extracted_text=RC + f" (pièce {i})"))
    db.commit()


def _compter(client, url):
    requetes = []

    def _noter(conn, cursor, statement, *a):
        requetes.append(statement)
    event.listen(engine, "before_cursor_execute", _noter)
    try:
        r = client.get(url)
    finally:
        event.remove(engine, "before_cursor_execute", _noter)
    assert r.status_code == 200, r.text
    return len(requetes), r.json()


def test_le_nombre_de_requetes_ne_depend_pas_du_nombre_de_pieces(client, db_session, test_org):
    _projet(db_session, test_org.id, "p-2", 2)
    _projet(db_session, test_org.id, "p-12", 12)
    _compter(client, "/api/projects/p-2/plan-memoire")                  # premier appel : caches de démarrage
    n2, _ = _compter(client, "/api/projects/p-2/plan-memoire")
    n12, plan = _compter(client, "/api/projects/p-12/plan-memoire")
    assert n12 == n2, (n2, n12)
    assert n12 <= 12
    import json
    assert "organisation du chantier" in json.dumps(plan, ensure_ascii=False).lower()   # les textes ont bien été lus
