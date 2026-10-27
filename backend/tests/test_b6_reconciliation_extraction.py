"""B6 — un projet coupé (redémarrage, déploiement) pendant l'extraction ou la détection
des lots ne reste plus bloqué.

  extracting_zip / extracting_text : les pièces au texte NULL sont relues (sans appel
      payant) ; sinon le projet repasse à « ready » ou, sans pièce, à un état d'où
      l'utilisateur redépose, avec un message positif ;
  detecting_lots : retour à « ready », cache de lots vide -> la route /lots relance la
      détection d'elle-même à la prochaine visite ;
  idempotent, multi-organisations.
"""
from datetime import date, datetime, timedelta

from models.organization import Organization
from models.project import Project, ProjectDocument
from services.run_reconciliation import reconcile_orphan_runs


def _projet(db, pid, org_id, statut, **kw):
    db.add(Project(id=pid, organization_id=org_id, name=f"AO {pid}", deadline=date.today(),
                   processing_status=statut, **kw))


def _piece(db, pid, nom, texte=None, taille=10, doc_type="rc", **kw):
    db.add(ProjectDocument(project_id=pid, type=doc_type, file_url=f"/uploads/{pid}/{nom}",
                           file_name=nom, extracted_text=texte, file_size=taille, **kw))


class Relanceur:
    def __init__(self):
        self.appels = []

    def __call__(self, project_id, docs_info):
        self.appels.append((project_id, sorted(d[1] for d in docs_info)))


def test_extracting_text_relit_les_pieces_au_texte_null(db_session, test_org):
    _projet(db_session, "p1", test_org.id, "extracting_text")
    _piece(db_session, "p1", "rc.pdf", texte=None)
    _piece(db_session, "p1", "ccap.pdf", texte="déjà lu " * 20)
    _piece(db_session, "p1", "cctp.pdf", texte=None)
    db_session.commit()

    r = Relanceur()
    assert reconcile_orphan_runs(db_session, relancer_extraction=r) == 1
    assert r.appels == [("p1", ["cctp.pdf", "rc.pdf"])]      # seulement les NULL
    db_session.expire_all()
    p = db_session.get(Project, "p1")
    assert p.processing_status == "extracting_text"          # le fil de reprise le fera passer à ready
    assert p.processing_progress == 0
    assert "reprise" in (p.processing_detail or "").lower()


def test_extracting_text_sans_piece_a_lire_repasse_ready(db_session, test_org):
    _projet(db_session, "p2", test_org.id, "extracting_text")
    _piece(db_session, "p2", "rc.pdf", texte="lu " * 30)
    db_session.commit()

    r = Relanceur()
    assert reconcile_orphan_runs(db_session, relancer_extraction=r) == 1
    assert r.appels == []
    db_session.expire_all()
    assert db_session.get(Project, "p2").processing_status == "ready"


def test_extracting_text_sans_relanceur_les_pieces_portent_un_message_visible(db_session, test_org):
    """Pas de fil de reprise possible : le projet n'est pas bloqué, et aucune pièce n'a un
    texte vide SANS explication."""
    _projet(db_session, "p3", test_org.id, "extracting_text")
    _piece(db_session, "p3", "rc.pdf", texte=None)
    db_session.commit()

    assert reconcile_orphan_runs(db_session) == 1
    db_session.expire_all()
    assert db_session.get(Project, "p3").processing_status == "ready"
    d = db_session.query(ProjectDocument).filter_by(project_id="p3").one()
    assert d.extracted_text == ""
    assert d.extraction_warning and "redéposez" in d.extraction_warning.lower()


def test_extracting_zip_avec_pieces_creees_reprend_la_lecture(db_session, test_org):
    _projet(db_session, "p4", test_org.id, "extracting_zip")
    _piece(db_session, "p4", "rc.pdf", texte=None)
    db_session.commit()
    r = Relanceur()
    assert reconcile_orphan_runs(db_session, relancer_extraction=r) == 1
    assert r.appels == [("p4", ["rc.pdf"])]


def test_extracting_zip_sans_piece_demande_de_redeposer_avec_message_positif(db_session, test_org):
    _projet(db_session, "p5", test_org.id, "extracting_zip")
    db_session.commit()
    assert reconcile_orphan_runs(db_session, relancer_extraction=Relanceur()) == 1
    db_session.expire_all()
    p = db_session.get(Project, "p5")
    assert p.processing_status == "error"        # état relançable par l'utilisateur
    detail = (p.processing_detail or "").lower()
    assert "redéposez" in detail
    for mot in ("manquant", "incomplet", "absent", "!"):
        assert mot not in detail


def test_detecting_lots_repasse_ready_et_le_cache_reste_vide(db_session, test_org):
    _projet(db_session, "p6", test_org.id, "detecting_lots", lots_detectes=None)
    _piece(db_session, "p6", "rc.pdf", texte="lu " * 30)
    db_session.commit()
    assert reconcile_orphan_runs(db_session, relancer_extraction=Relanceur()) == 1
    db_session.expire_all()
    p = db_session.get(Project, "p6")
    assert p.processing_status == "ready"
    assert p.lots_detectes is None               # /lots relance la détection à la visite


def test_detecting_lots_est_relance_par_la_route_lots(client, db_session, test_org, monkeypatch):
    """Preuve de bout en bout : après réconciliation, GET /lots relance la détection."""
    import routers.projects as projects_mod
    _projet(db_session, "p7", test_org.id, "detecting_lots", lots_detectes=None)
    _piece(db_session, "p7", "rc.pdf", texte="lu " * 30)
    db_session.commit()
    reconcile_orphan_runs(db_session)
    lances = []
    monkeypatch.setattr(projects_mod, "_run_lot_detection_background",
                        lambda *a, **k: lances.append(a[0]))
    resp = client.get("/api/projects/p7/lots")
    assert resp.status_code == 200
    assert resp.json()["status"] == "detecting_lots"
    for t in __import__("threading").enumerate():
        if t.name.startswith("synorix-lots-"):
            t.join(timeout=10)
    assert lances == ["p7"]


def test_idempotent_et_multi_organisations(db_session, test_org):
    autre = Organization(id="org-test-2", name="Autre BTP")
    db_session.add(autre)
    _projet(db_session, "a1", test_org.id, "extracting_text")
    _piece(db_session, "a1", "rc.pdf", texte=None)
    _projet(db_session, "b1", autre.id, "detecting_lots")
    _projet(db_session, "b2", autre.id, "extracting_zip")
    _projet(db_session, "ok", autre.id, "ready")
    db_session.commit()

    r = Relanceur()
    assert reconcile_orphan_runs(db_session, relancer_extraction=r) == 3
    assert [a[0] for a in r.appels] == ["a1"]
    db_session.expire_all()
    assert db_session.get(Project, "b1").processing_status == "ready"
    assert db_session.get(Project, "b2").processing_status == "error"
    assert db_session.get(Project, "ok").processing_status == "ready"
    # Deuxième passage : les projets de b1/b2 sont stables ; a1 n'est reprise que si
    # son extraction est encore en cours (le fil de reprise la termine).
    r2 = Relanceur()
    assert reconcile_orphan_runs(db_session, relancer_extraction=r2) == 1   # a1 seul
    db_session.expire_all()
    assert db_session.get(Project, "b1").processing_status == "ready"
    assert db_session.get(Project, "b2").processing_status == "error"


def test_projet_supprime_n_est_pas_relance(db_session, test_org):
    _projet(db_session, "d1", test_org.id, "extracting_text", deleted_at=datetime.utcnow())
    _piece(db_session, "d1", "rc.pdf", texte=None)
    db_session.commit()
    r = Relanceur()
    assert reconcile_orphan_runs(db_session, relancer_extraction=r) == 1
    assert r.appels == []


def test_phase_differee_interrompue_est_reprise(db_session, test_org):
    """Un gros PDF resté en « [document volumineux …] » (déploiement pendant la phase 2)
    est remis à lire ; un placeholder ancien ou d'un projet supprimé n'est pas touché."""
    _projet(db_session, "r1", test_org.id, "ready")
    _piece(db_session, "r1", "gros.pdf", texte="[document volumineux - gros.pdf]", taille=9_000_000,
           doc_type="autre", uploaded_at=datetime.utcnow() - timedelta(minutes=10))
    _projet(db_session, "r2", test_org.id, "ready")
    _piece(db_session, "r2", "vieux.pdf", texte="[document volumineux - vieux.pdf]", taille=9_000_000,
           doc_type="autre", uploaded_at=datetime.utcnow() - timedelta(days=10))
    db_session.commit()

    r = Relanceur()
    assert reconcile_orphan_runs(db_session, relancer_extraction=r) == 1
    assert r.appels == [("r1", ["gros.pdf"])]
    db_session.expire_all()
    assert db_session.get(Project, "r1").processing_status == "ready"   # reprise silencieuse
    d = db_session.query(ProjectDocument).filter_by(project_id="r2").one()
    assert d.extracted_text.startswith("[document volumineux")


def test_de_bout_en_bout_le_fil_de_reprise_lit_les_pieces_et_libere_le_projet(
        db_session, test_org, tmp_path, monkeypatch):
    """Vrai fil de reprise, vraie lecture locale (aucun appel payant) : les textes NULL
    sont remplis et le projet passe à « ready »."""
    import threading

    import routers.projects as projects_mod
    from services.run_reconciliation import lancer_extraction_en_fond
    from tests.pdf_fabrique import pdf_texte

    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)
    (tmp_path / "p8").mkdir()
    (tmp_path / "p8" / "rc.pdf").write_bytes(
        pdf_texte(["Règlement de consultation. Le candidat fournit un extrait Kbis. " * 4]))
    _projet(db_session, "p8", test_org.id, "extracting_text")
    _piece(db_session, "p8", "rc.pdf", texte=None, taille=2000)
    db_session.commit()

    assert reconcile_orphan_runs(db_session, relancer_extraction=lancer_extraction_en_fond) == 1
    for t in threading.enumerate():
        if t.name.startswith("synorix-extract-"):
            t.join(timeout=30)
    db_session.expire_all()
    d = db_session.query(ProjectDocument).filter_by(project_id="p8").one()
    assert "Kbis" in (d.extracted_text or "")
    assert db_session.get(Project, "p8").processing_status == "ready"
