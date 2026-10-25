"""
B10 — corps de POST /analyze validé (revue backend du 23/10, B10).

Avant : `payload: dict` non validé. {"lots": "lot1"} était parcouru caractère
par caractère (4 « lots », 4 unités consommées) ; avec des doublons, le
remboursement (dict par lot) ne rendait qu'une unité.
Maintenant : liste de lots unique, bornée, chaque lot connu du projet
(détecté, sélectionné, ou ajouté à la main dans l'écran Lots : « lot1 » à
« lot30 ») — sinon 422, AVANT tout décompte d'unité.
"""
import threading
from datetime import date

import pytest

from models.project import Project, ProjectDocument
from models.quota_consumption import QuotaConsumption


def _attendre():
    for t in threading.enumerate():
        if t.name.startswith("synorix-analysis-"):
            t.join(timeout=30)


@pytest.fixture(autouse=True)
def _sans_ia(monkeypatch):
    from services.ai import dce_analyzer

    def _passe(self, pass_text, system_prompt, label, *a, **kw):
        return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _passe)


def _projet(db, org_id, pid):
    from models.organization import Organization
    db.get(Organization, org_id).plan = "pro"
    db.add(Project(id=pid, organization_id=org_id, name="AO B10", deadline=date.today(),
                   lots_detectes=[{"id": "lot1", "nom": "Lot 01 — GO"},
                                  {"id": "lot2", "nom": "Lot 02 — Façades"}]))
    db.add(ProjectDocument(project_id=pid, type="rc", file_url="x", file_name="rc.pdf",
                           extracted_text="Règlement de la consultation. Candidature. " * 40))
    db.commit()


def _unites(db, org_id):
    db.expire_all()
    return db.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == org_id, QuotaConsumption.kind == "analysis").count()


@pytest.mark.parametrize("corps", [
    {"lots": "lot1"},                    # une chaîne, pas une liste
    {"lots": ["lot1", "lot1"]},          # doublon
    {"lots": ["lot1", "lotX"]},          # lot inconnu du projet
    {"lots": ["lot1", "lot31"]},         # hors des lots que l'écran peut ajouter
    {"lots": [1, 2]},                    # pas des identifiants
    {"lots": []},                        # liste vide
    {"lots": [f"lot{i}" for i in range(1, 42)]},  # au-delà de la borne
    {"lots": ["lot1"], "inconnu": True}, # champ inattendu
])
def test_corps_invalide_422_sans_unite(client, db_session, test_org, corps):
    _projet(db_session, test_org.id, "proj-b10")

    r = client.post("/api/projects/proj-b10/analyze", json=corps)
    assert r.status_code == 422, (corps, r.status_code, r.text)
    assert _unites(db_session, test_org.id) == 0
    assert db_session.get(Project, "proj-b10").processing_status != "analyzing"


def test_lots_detectes_une_unite_par_lot(client, db_session, test_org):
    _projet(db_session, test_org.id, "proj-b10-ok")
    r = client.post("/api/projects/proj-b10-ok/analyze", json={"lots": ["lot1", "lot2"]})
    assert r.status_code == 200, r.text
    assert r.json()["lots"] == ["lot1", "lot2"]
    _attendre()
    assert _unites(db_session, test_org.id) == 2


def test_lot_ajoute_a_la_main_reste_accepte(client, db_session, test_org):
    """L'écran Lots permet d'ajouter un lot non détecté (« lot7 ») : il n'est
    pas enregistré dans lots_detectes, mais reste analysable."""
    _projet(db_session, test_org.id, "proj-b10-main")
    r = client.post("/api/projects/proj-b10-main/analyze", json={"lots": ["lot1", "lot7"]})
    assert r.status_code == 200, r.text
    _attendre()
    assert _unites(db_session, test_org.id) == 2


@pytest.mark.parametrize("corps", [None, {}])
def test_sans_liste_le_lot_selectionne(client, db_session, test_org, corps):
    _projet(db_session, test_org.id, "proj-b10-def")
    r = (client.post("/api/projects/proj-b10-def/analyze") if corps is None
         else client.post("/api/projects/proj-b10-def/analyze", json=corps))
    assert r.status_code == 200, r.text
    assert r.json()["lots"] == ["all"]
    _attendre()
    assert _unites(db_session, test_org.id) == 1


def test_echec_rend_chaque_unite(client, db_session, test_org, monkeypatch):
    """Lots uniques : chaque unité décomptée est rendue en cas d'échec."""
    from services.ai import dce_analyzer

    def _panne(self, *a, **kw):
        raise RuntimeError("panne")
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _panne)
    _projet(db_session, test_org.id, "proj-b10-ko")

    r = client.post("/api/projects/proj-b10-ko/analyze", json={"lots": ["lot1", "lot2"]})
    assert r.status_code == 200, r.text
    _attendre()
    assert _unites(db_session, test_org.id) == 0
