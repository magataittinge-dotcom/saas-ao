"""R-06 (audit données, P2) — un AO ne se pousse plus à une étape quelconque.

Avant : `PATCH /projects/{id}` acceptait n'importe quel `current_step` (99, −5) et `POST /complete-step/{step}` toute
valeur : un état que les écrans n'ont pas prévu. Désormais l'étape est bornée à 1..7 (422 au-delà). Le contrôle des
prérequis (« étape 5 sans analyse → 409 ») demande une décision sur le parcours : non fait, noté au rapport."""
import pytest

from models.project import Project


@pytest.fixture
def ao(db_session, test_org):
    db_session.add(Project(id="p-r06", organization_id=test_org.id, name="AO R-06", current_step=3))
    db_session.commit()


@pytest.mark.parametrize("etape", [0, -5, 8, 99])
def test_patch_etape_hors_bornes_422(client, db_session, ao, etape):
    assert client.patch("/api/projects/p-r06", json={"current_step": etape}).status_code == 422
    db_session.expire_all()
    assert db_session.get(Project, "p-r06").current_step == 3


@pytest.mark.parametrize("etape", [0, -1, 8, 99])
def test_complete_step_hors_bornes_422(client, db_session, ao, etape):
    assert client.post(f"/api/projects/p-r06/complete-step/{etape}").status_code == 422
    db_session.expire_all()
    p = db_session.get(Project, "p-r06")
    assert p.current_step == 3 and not (p.completed_steps or {})


def test_etapes_du_parcours_acceptees(client, db_session, ao):
    assert client.patch("/api/projects/p-r06", json={"current_step": 7}).status_code == 200
    assert client.post("/api/projects/p-r06/complete-step/3").status_code == 200
    assert client.post("/api/projects/p-r06/complete-step/7").status_code == 200
