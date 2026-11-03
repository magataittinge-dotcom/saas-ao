"""3/11 : aucun appel IA à la fin du dépôt. `GET /lots?sans_ia=1` (appelé par l'écran de dépôt) n'utilise que la lecture sans IA ;
si le filet IA des lots se serait déclenché, rien n'est mis en cache comme « fait » : l'écran des lots (sans le paramètre) lance
le filet, compté dans le plafond du jour de l'entreprise. Données inventées."""
from types import SimpleNamespace

import pytest

from models.depot_entreprise import CoutIA
from models.project import Project, ProjectDocument
import services.ai.lot_fallback as lf
from services import depot_budget

RC_TEXTE = "Le marché est divisé en 13 lots.\nLot 1 — Gros œuvre inventé\nLot 2 — Charpente inventée"


def _lot(lot_id, nom):
    return {"id": lot_id, "nom": nom, "confidence": 90, "sources": ["rc_table"]}


def _projet(db, org_id, pid="p-sans-ia", **kw):
    db.add(Project(id=pid, organization_id=org_id, name="AO sans IA", **kw))
    db.add(ProjectDocument(project_id=pid, type="rc", file_url=f"/uploads/projects/{pid}/rc.pdf", file_name="RC.pdf", extracted_text=RC_TEXTE))
    db.commit()


def _docs(pid="p-sans-ia"):
    return [{"id": "d1", "file_name": "RC.pdf", "file_url": f"/uploads/projects/{pid}/rc.pdf", "extracted_text": RC_TEXTE, "type": "rc", "related_lots": None}]


@pytest.fixture
def appels_ia(monkeypatch):
    """Le filet IA simulé : compte ses appels, renvoie un lot, et déclare ses jetons comme le vrai appel."""
    appels = {"n": 0}

    def faux(excerpts, detected, announced, on_usage=None):
        appels["n"] += 1
        if on_usage:
            on_usage({"input_tokens": 1200, "output_tokens": 150})
        return [{"id": "lot3", "nom": "Lot 3 — Menuiseries inventées"}]
    monkeypatch.setattr(lf, "_call_claude", faux)
    return appels


@pytest.fixture
def detection_partielle(monkeypatch):
    """Le règlement annonce 13 lots, la lecture sans IA en trouve 2 : le filet se déclenche (échec objectif)."""
    import routers.projects as projects_mod
    monkeypatch.setattr(projects_mod.lot_detector, "detect", lambda *a, **k: [_lot("lot1", "Lot 1 — Gros œuvre inventé"), _lot("lot2", "Lot 2 — Charpente inventée")])
    return projects_mod


def test_sans_ia_le_filet_n_est_jamais_appele_meme_sur_un_echec_objectif(db_session, test_org, appels_ia, detection_partielle):
    _projet(db_session, test_org.id)
    detection_partielle._run_lot_detection_background("p-sans-ia", _docs(), detection_partielle.UPLOADS_ROOT, sans_ia=True)
    assert appels_ia["n"] == 0
    db_session.expire_all()
    p = db_session.get(Project, "p-sans-ia")
    assert p.lots_detectes is None                                    # pas de résultat « fait » : le filet reste à passer
    assert p.lots_ecartes == {"ia_en_attente": True}
    assert p.processing_status == "ready"
    assert db_session.query(CoutIA).count() == 0


def test_sans_ia_et_lecture_propre_le_resultat_est_garde_sans_aucun_appel(db_session, test_org, appels_ia, monkeypatch):
    import routers.projects as projects_mod
    _projet(db_session, test_org.id)
    monkeypatch.setattr(projects_mod.lot_detector, "detect", lambda *a, **k: [_lot("lot1", "Lot 1 — Gros œuvre inventé")])
    monkeypatch.setattr(lf, "filet_necessaire", lambda *a, **k: False)
    projects_mod._run_lot_detection_background("p-sans-ia", _docs(), projects_mod.UPLOADS_ROOT, sans_ia=True)
    assert appels_ia["n"] == 0
    db_session.expire_all()
    p = db_session.get(Project, "p-sans-ia")
    assert [l["id"] for l in p.lots_detectes] == ["lot1"]


def test_a_l_ecran_des_lots_le_filet_est_appele_et_compte_dans_le_plafond(db_session, test_org, appels_ia, detection_partielle):
    _projet(db_session, test_org.id, lots_ecartes={"ia_en_attente": True})
    avant = depot_budget.appels_du_jour(db_session, test_org.id)
    detection_partielle._run_lot_detection_background("p-sans-ia", _docs(), detection_partielle.UPLOADS_ROOT)
    assert appels_ia["n"] == 1
    assert depot_budget.appels_du_jour(db_session, test_org.id) == avant + 1
    ligne = db_session.query(CoutIA).one()
    assert ligne.organization_id == test_org.id and ligne.usage == depot_budget.USAGE and ligne.modele == lf._MODEL
    assert ligne.jetons_entree == 1200 and ligne.cout_eur > 0
    db_session.expire_all()
    p = db_session.get(Project, "p-sans-ia")
    assert {l["id"] for l in p.lots_detectes} == {"lot1", "lot2", "lot3"}
    assert "ia_en_attente" not in (p.lots_ecartes or {})              # le marqueur disparaît avec le vrai résultat


def test_plafond_atteint_le_filet_n_est_pas_appele_et_le_resultat_sans_ia_est_garde(db_session, test_org, appels_ia, detection_partielle, monkeypatch):
    monkeypatch.setenv("DEPOT_APPELS_PAR_JOUR", "1")
    from services import couts_ia
    couts_ia.enregistrer(db_session, test_org.id, depot_budget.USAGE, lf._MODEL, {"input_tokens": 10, "output_tokens": 10})
    _projet(db_session, test_org.id)
    detection_partielle._run_lot_detection_background("p-sans-ia", _docs(), detection_partielle.UPLOADS_ROOT)
    assert appels_ia["n"] == 0
    assert db_session.query(CoutIA).count() == 1                      # rien d'ajouté au compteur
    db_session.expire_all()
    p = db_session.get(Project, "p-sans-ia")
    assert {l["id"] for l in p.lots_detectes} == {"lot1", "lot2"}
    assert p.lots_ecartes["ia_plafond"] == "jour"


def test_plafond_du_mois_atteint_aucun_appel(db_session, test_org, appels_ia, detection_partielle, monkeypatch):
    monkeypatch.setenv("DEPOT_BUDGET_MENSUEL_EUR", "0")
    _projet(db_session, test_org.id)
    detection_partielle._run_lot_detection_background("p-sans-ia", _docs(), detection_partielle.UPLOADS_ROOT)
    assert appels_ia["n"] == 0
    db_session.expire_all()
    assert db_session.get(Project, "p-sans-ia").lots_ecartes["ia_plafond"] == "mois"


def test_les_appels_d_une_autre_entreprise_ne_comptent_pas_dans_mon_plafond(db_session, test_org, appels_ia, detection_partielle, monkeypatch):
    from models.organization import Organization
    from services import couts_ia
    db_session.add(Organization(id="org-voisine", name="Voisine BTP"))
    db_session.commit()
    monkeypatch.setenv("DEPOT_APPELS_PAR_JOUR", "1")
    couts_ia.enregistrer(db_session, "org-voisine", depot_budget.USAGE, lf._MODEL, {"input_tokens": 10, "output_tokens": 10})
    _projet(db_session, test_org.id)
    detection_partielle._run_lot_detection_background("p-sans-ia", _docs(), detection_partielle.UPLOADS_ROOT)
    assert appels_ia["n"] == 1


class _FauxFil:
    lances: list = []

    def __init__(self, target=None, args=(), kwargs=None, **_):
        self.cible, self.args, self.kwargs = target, args, kwargs or {}

    def start(self):
        _FauxFil.lances.append((self.cible, self.args, self.kwargs))


@pytest.fixture
def faux_fil(monkeypatch):
    import routers.projects as projects_mod
    _FauxFil.lances = []
    monkeypatch.setattr(projects_mod, "threading", SimpleNamespace(Thread=_FauxFil, Lock=__import__("threading").Lock))
    return _FauxFil.lances


def test_la_route_transmet_sans_ia_a_la_detection(client, db_session, test_org, faux_fil):
    _projet(db_session, test_org.id)
    r = client.get("/api/projects/p-sans-ia/lots?sans_ia=1")
    assert r.status_code == 200 and r.json()["status"] == "detecting_lots"
    assert len(faux_fil) == 1 and faux_fil[0][2].get("sans_ia") is True


def test_la_route_sans_le_parametre_laisse_l_ia_permise(client, db_session, test_org, faux_fil):
    _projet(db_session, test_org.id)
    r = client.get("/api/projects/p-sans-ia/lots")
    assert r.status_code == 200 and r.json()["status"] == "detecting_lots"
    assert len(faux_fil) == 1 and faux_fil[0][2].get("sans_ia") is False


def test_la_route_sans_ia_dit_que_le_filet_reste_a_passer_sans_relancer_la_detection(client, db_session, test_org, faux_fil):
    _projet(db_session, test_org.id, lots_ecartes={"ia_en_attente": True}, processing_status="ready")
    r = client.get("/api/projects/p-sans-ia/lots?sans_ia=1")
    assert r.status_code == 200
    assert r.json() == {"lots": [], "count": 0, "cached": False, "ia_necessaire": True, "ecartes": None}
    assert faux_fil == []                                             # aucune détection relancée, donc aucune boucle d'attente


def test_la_route_des_lots_sans_le_parametre_relance_la_detection_malgre_le_marqueur(client, db_session, test_org, faux_fil):
    _projet(db_session, test_org.id, lots_ecartes={"ia_en_attente": True}, processing_status="ready")
    r = client.get("/api/projects/p-sans-ia/lots")
    assert r.json()["status"] == "detecting_lots"
    assert len(faux_fil) == 1 and faux_fil[0][2].get("sans_ia") is False


def test_la_route_sans_ia_autre_organisation_404(client, db_session, test_org, faux_fil):
    from models.organization import Organization
    db_session.add(Organization(id="org-autre-sans-ia", name="Autre BTP"))
    db_session.commit()
    _projet(db_session, "org-autre-sans-ia", lots_ecartes={"ia_en_attente": True})
    assert client.get("/api/projects/p-sans-ia/lots?sans_ia=1").status_code == 404
    assert client.get("/api/projects/p-sans-ia/lots").status_code == 404
    assert faux_fil == []


def test_un_depot_ou_une_suppression_efface_le_marqueur(db_session, test_org):
    import routers.projects as projects_mod
    _projet(db_session, test_org.id, lots_ecartes={"ia_en_attente": True})
    projects_mod._invalidate_lots_cache("p-sans-ia", db_session)
    db_session.expire_all()
    assert db_session.get(Project, "p-sans-ia").lots_ecartes is None
