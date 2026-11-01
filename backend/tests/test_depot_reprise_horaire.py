"""Lectures de dépôt reportées (M3) : en plus de la reprise à l'ouverture de l'écran et au prochain dépôt, une tâche Celery
beat toutes les heures relance, entreprise par entreprise, les lectures `differee` dont la place est revenue.

Dans le worker, la lecture va jusqu'au bout DANS la tâche (pas de fil détaché qui mourrait avec le processus enfant) ;
la prise d'une lecture est atomique (l'API et le beat ne la lancent jamais deux fois) ; une entreprise n'est jamais lue
pour une autre ; les plafonds jouent ; les journaux ne contiennent ni texte ni nom. Aucun appel réel."""
import logging
import threading
from datetime import datetime, timedelta

import pytest

from models.depot_entreprise import CoutIA, LectureDepot
from models.document import Document
from models.organization import Organization
from services import depot_budget, depot_extraction
from tests import depot_fabrique as fab
from tests.depot_fabrique import (KBIS_COMPLET, attendre_les_lectures, coffre, deposer_et_lire, deux_orgs, etat_de,  # noqa: F401
                                  modele)

ORG_A, ORG_B = "org-test-1", "org-b"


def _differee(db, org, nom="nom-secret-du-client.pdf", n=0):
    """Une lecture différée (et sa pièce du coffre-fort) posée directement en base."""
    doc = Document(organization_id=org, type="kbis", file_url=f"/uploads/{org}/{n}.pdf", file_name=nom,
                   rubrique_entreprise="identite", case_depot="kbis")
    db.add(doc)
    db.flush()
    lecture = LectureDepot(organization_id=org, document_id=doc.id, case_depot="kbis", rubrique="identite",
                           sha256=f"{n:064d}", etat="differee", message="reprise demain",
                           created_at=datetime.utcnow() + timedelta(seconds=n))
    db.add(lecture)
    db.commit()
    return lecture.id


def _cout(db, org, n):
    for _ in range(n):
        db.add(CoutIA(organization_id=org, usage="depot_entreprise", modele="claude-haiku-4-5-20251001", jetons_entree=1,
                      jetons_sortie=1, cout_usd=0.001, cout_eur=0.001, created_at=datetime.utcnow()))
    db.commit()


@pytest.fixture
def lecteur(monkeypatch):
    """`traiter_lecture` simulée : note l'appel, le fil qui l'exécute, et termine la lecture."""
    appels = []

    def faux(lecture_id):
        from database import SessionLocal
        s = SessionLocal()
        try:
            l = s.get(LectureDepot, lecture_id)
            appels.append((lecture_id, l.organization_id, l.etat, threading.current_thread().name))
            l.etat, l.terminee_le = "lu", datetime.utcnow()
            s.commit()
        finally:
            s.close()

    monkeypatch.setattr(depot_extraction, "traiter_lecture", faux)
    return appels


def _interdire_le_fil_detache(monkeypatch):
    def interdit(*a, **k):
        raise AssertionError("une lecture du worker ne doit pas partir dans un fil détaché")
    monkeypatch.setattr(depot_extraction, "lancer", interdit)


# ─── Déclaration de la tâche ───────────────────────────────────────────────────

def test_tache_enregistree_et_planifiee_toutes_les_heures():
    import tasks
    from tasks.check_expiry import celery_app
    nom = "tasks.depot_lectures.reprendre_lectures_differees"
    assert nom in celery_app.tasks
    entree = [e for e in celery_app.conf.beat_schedule.values() if e["task"] == nom]
    assert len(entree) == 1 and entree[0]["schedule"] == 3600
    assert "reprendre_lectures_differees_tache" in tasks.__all__


def test_les_unites_systemd_n_ont_rien_a_changer_pour_la_tache():
    """Le beat envoie la tâche, le worker (`celery -A tasks worker`) la découvre par `tasks/__init__` : mêmes commandes."""
    from pathlib import Path
    racine = Path(__file__).resolve().parents[2] / "deploy" / "systemd"
    assert "celery -A tasks beat" in (racine / "synorix-celery-beat.service").read_text(encoding="utf-8")
    assert "celery -A tasks worker" in (racine / "synorix-celery-worker.service").read_text(encoding="utf-8")


# ─── La tâche ──────────────────────────────────────────────────────────────────

def test_la_tache_relance_les_lectures_de_chaque_entreprise_jusqu_au_bout_dans_son_propre_fil(
        db_session, deux_orgs, lecteur, monkeypatch):
    from tasks.depot_lectures import reprendre_lectures_differees_tache
    _interdire_le_fil_detache(monkeypatch)
    a1, a2 = _differee(db_session, ORG_A, n=1), _differee(db_session, ORG_A, n=2)
    b1 = _differee(db_session, ORG_B, n=3)
    resultat = reprendre_lectures_differees_tache()
    assert resultat == {"organisations": 2, "relancees": 3, "erreurs": 0}
    assert [a[0] for a in lecteur if a[1] == ORG_A] == [a1, a2]           # dans l'ordre d'arrivée
    assert [a[0] for a in lecteur if a[1] == ORG_B] == [b1]
    assert all(a[2] == "en_lecture" for a in lecteur)                      # prise avant la lecture
    assert all(a[3] == threading.current_thread().name for a in lecteur)   # synchrone : le fil de la tâche
    db_session.expire_all()
    assert {l.etat for l in db_session.query(LectureDepot).all()} == {"lu"}
    assert not [f for f in threading.enumerate() if f.name.startswith("synorix-depot-")]


def test_sans_lecture_differee_la_tache_ne_fait_rien(db_session, deux_orgs, lecteur):
    from tasks.depot_lectures import reprendre_lectures_differees_tache
    assert reprendre_lectures_differees_tache() == {"organisations": 0, "relancees": 0, "erreurs": 0}
    assert lecteur == []


def test_isolation_par_entreprise_une_reprise_ne_lit_que_ses_lectures(db_session, deux_orgs, lecteur):
    a = _differee(db_session, ORG_A, n=1)
    b = _differee(db_session, ORG_B, n=2)
    assert depot_budget.reprendre_differees(db_session, ORG_A, synchrone=True) == 1
    assert [x[0] for x in lecteur] == [a]
    db_session.expire_all()
    assert db_session.get(LectureDepot, b).etat == "differee"             # celle de l'autre entreprise n'a pas bougé


def test_les_plafonds_de_chaque_entreprise_sont_respectes_par_la_tache(db_session, deux_orgs, lecteur, monkeypatch):
    from tasks.depot_lectures import reprendre_lectures_differees_tache
    monkeypatch.setenv("DEPOT_APPELS_PAR_JOUR", "2")
    _cout(db_session, ORG_A, 2)                                            # A a épuisé son jour, pas B
    a = _differee(db_session, ORG_A, n=1)
    b = _differee(db_session, ORG_B, n=2)
    assert reprendre_lectures_differees_tache() == {"organisations": 2, "relancees": 1, "erreurs": 0}
    assert [x[0] for x in lecteur] == [b]
    db_session.expire_all()
    assert db_session.get(LectureDepot, a).etat == "differee" and db_session.get(LectureDepot, b).etat == "lu"


def test_une_piece_supprimee_pendant_l_attente_n_est_jamais_lue_par_la_tache(db_session, deux_orgs, lecteur):
    from tasks.depot_lectures import reprendre_lectures_differees_tache
    l = _differee(db_session, ORG_A, n=1)
    db_session.get(Document, db_session.get(LectureDepot, l).document_id).deleted_at = datetime.utcnow()
    db_session.commit()
    assert reprendre_lectures_differees_tache()["relancees"] == 0 and lecteur == []
    db_session.expire_all()
    assert db_session.get(LectureDepot, l).etat == "ecartee"


def test_une_entreprise_en_erreur_n_arrete_pas_les_autres_et_le_journal_est_muet(db_session, deux_orgs, lecteur, caplog,
                                                                                  monkeypatch):
    from tasks.depot_lectures import reprendre_lectures_differees_tache
    a = _differee(db_session, ORG_A, nom="Dupont Jean carte identite.pdf", n=1)
    b = _differee(db_session, ORG_B, n=2)
    vrai = depot_extraction.traiter_lecture

    def instable(lecture_id):
        if lecture_id == a:
            raise RuntimeError("Dupont Jean 12 rue des Lilas")
        return vrai(lecture_id)

    monkeypatch.setattr(depot_extraction, "traiter_lecture", instable)
    with caplog.at_level(logging.DEBUG):
        resultat = reprendre_lectures_differees_tache()
    assert resultat["erreurs"] == 1 and [x[0] for x in lecteur] == [b]
    journal = " ".join(r.getMessage() + str(r.exc_info) for r in caplog.records)
    assert "Dupont" not in journal and "Lilas" not in journal and "carte identite" not in journal
    assert not any(r.exc_info for r in caplog.records if r.name.startswith("tasks"))   # pas de trace avec le message de l'erreur


def test_lecture_reelle_de_bout_en_bout_dans_la_tache(client, coffre, db_session, modele, monkeypatch):
    """Une vraie lecture (modèle simulé) reportée par le plafond du jour, reprise le lendemain par la tâche seule."""
    from tasks.depot_lectures import reprendre_lectures_differees_tache
    monkeypatch.setenv("DEPOT_APPELS_PAR_JOUR", "1")
    m = modele({"kbis": KBIS_COMPLET})
    _cout(db_session, ORG_A, 1)
    deposer_et_lire(client, "kbis", ("kbis.pdf", fab.pdf(fab.TEXTE_KBIS)))
    assert m.appels == []
    for c in db_session.query(CoutIA).all():
        c.created_at = datetime.utcnow() - timedelta(days=2)
    db_session.commit()
    _interdire_le_fil_detache(monkeypatch)
    assert reprendre_lectures_differees_tache()["relancees"] == 1
    assert len(m.appels) == 1                                              # lue pendant la tâche, sans attendre un fil
    assert etat_de(client, "kbis")["etat"] == "lu"


# ─── Prise atomique ────────────────────────────────────────────────────────────

def test_une_lecture_deja_prise_par_l_autre_processus_n_est_pas_relancee(db_session, deux_orgs, lecteur, monkeypatch):
    """L'API a pris la lecture entre le moment où la liste est lue et celui où on la prend : zéro lancement."""
    from database import SessionLocal
    l = _differee(db_session, ORG_A, n=1)
    vrai = depot_budget.raison_de_report

    def autre_processus_prend_la_lecture(db, org, avec_file=True):
        s = SessionLocal()
        try:
            s.query(LectureDepot).filter(LectureDepot.id == l).update({"etat": "en_lecture"})
            s.commit()
        finally:
            s.close()
        monkeypatch.setattr(depot_budget, "raison_de_report", vrai)
        return None

    monkeypatch.setattr(depot_budget, "raison_de_report", autre_processus_prend_la_lecture)
    assert depot_budget.reprendre_differees(db_session, ORG_A, synchrone=True) == 0
    assert lecteur == []


def test_deux_reprises_de_suite_ne_lancent_la_lecture_qu_une_fois(db_session, deux_orgs, lecteur):
    _differee(db_session, ORG_A, n=1)
    assert depot_budget.reprendre_differees(db_session, ORG_A, synchrone=True) == 1
    assert depot_budget.reprendre_differees(db_session, ORG_A, synchrone=True) == 0
    assert len(lecteur) == 1


def test_deux_sessions_simultanees_ne_lancent_la_lecture_qu_une_fois(db_session, deux_orgs, monkeypatch):
    """Deux reprises (API et beat) en même temps sur la même lecture : un seul lancement (l'UPDATE conditionnel)."""
    from database import SessionLocal
    _differee(db_session, ORG_A, n=1)
    lances, barriere = [], threading.Barrier(2)
    monkeypatch.setattr(depot_extraction, "traiter_lecture", lambda lecture_id: lances.append(lecture_id))
    vrai = depot_budget.raison_de_report

    def synchronisee(db, org, avec_file=True):
        resultat = vrai(db, org, avec_file)
        try:
            barriere.wait(timeout=5)                   # les deux ont vu la lecture « différée » avant que l'une la prenne
        except threading.BrokenBarrierError:
            pass
        return resultat

    monkeypatch.setattr(depot_budget, "raison_de_report", synchronisee)
    totaux = []

    def une_reprise():
        s = SessionLocal()
        try:
            totaux.append(depot_budget.reprendre_differees(s, ORG_A, synchrone=True))
        finally:
            s.close()

    fils = [threading.Thread(target=une_reprise) for _ in range(2)]
    [f.start() for f in fils]
    [f.join(30) for f in fils]
    assert sorted(totaux) == [0, 1] and len(lances) == 1


def test_la_reprise_de_l_api_reste_dans_un_fil_detache(db_session, deux_orgs, monkeypatch):
    """Sans `synchrone`, rien ne change pour l'API : la lecture part dans un fil détaché (`lancer`)."""
    _differee(db_session, ORG_A, n=1)
    lances = []
    monkeypatch.setattr(depot_extraction, "lancer", lambda lecture_id, org: lances.append((lecture_id, org)))
    assert depot_budget.reprendre_differees(db_session, ORG_A) == 1 and len(lances) == 1 and lances[0][1] == ORG_A


def test_les_textes_ne_disent_plus_aucun_planificateur():
    from pathlib import Path
    racine = Path(__file__).resolve().parents[1]
    for chemin in ("services/depot_budget.py", "services/depot_etat.py", "routers/depot_entreprise.py"):
        assert "aucun planificateur" not in (racine / chemin).read_text(encoding="utf-8")
    assert "toutes les heures" in (racine / "services/depot_budget.py").read_text(encoding="utf-8")
