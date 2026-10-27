"""B18 — purge des AO supprimés depuis plus de N jours.

Simulation par défaut (comptes seulement), purge réelle sur demande, rien hors du dossier du
projet, rien de ce qui est encore référencé ailleurs, isolation entre organisations.
"""
import logging
import os
from datetime import datetime, timedelta

import pytest

from models.checklist_item import ChecklistItem
from models.compliance_item import ComplianceItem
from models.document import Document
from models.memoire import MemoireTechnique
from models.organization import Organization
from models.project import Project, ProjectDocument
from services.purge_ao import jours_de_conservation, purge_active, purger_ao_supprimes

MAINTENANT = datetime(2026, 11, 20, 12, 0, 0)


@pytest.fixture
def racine(tmp_path):
    (tmp_path / "projects").mkdir()
    return tmp_path


def _ecrire(racine, projet, rel, contenu=b"x" * 1000):
    chemin = racine / "projects" / projet / rel
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_bytes(contenu)
    return chemin


def _projet(db, pid, org_id, jours_supprime=None, **kw):
    db.add(Project(
        id=pid, organization_id=org_id, name=f"AO secret {pid}",
        deleted_at=None if jours_supprime is None else MAINTENANT - timedelta(days=jours_supprime), **kw))
    db.flush()


def _piece(db, pid, rel, **kw):
    d = ProjectDocument(project_id=pid, type="rc", file_url=f"/uploads/projects/{pid}/{rel}",
                        file_name=rel.split("/")[-1], extracted_text="texte", **kw)
    db.add(d)
    db.flush()
    return d


def _purger(db, racine, **kw):
    return purger_ao_supprimes(db, maintenant=MAINTENANT, uploads_root=racine, **kw)


# ─── Réglages ────────────────────────────────────────────────────────────────

def test_reglages_par_defaut_simulation_30_jours(monkeypatch):
    monkeypatch.delenv("SYNORIX_PURGE_AO_JOURS", raising=False)
    monkeypatch.delenv("SYNORIX_PURGE_AO_ACTIVE", raising=False)
    assert jours_de_conservation() == 30
    assert purge_active() is False


@pytest.mark.parametrize("brut,attendu", [("45", 45), ("0", 30), ("-3", 30), ("abc", 30), ("", 30)])
def test_jours_invalides_reviennent_a_30(monkeypatch, brut, attendu):
    monkeypatch.setenv("SYNORIX_PURGE_AO_JOURS", brut)
    assert jours_de_conservation() == attendu


@pytest.mark.parametrize("brut,attendu", [("1", True), ("0", False), ("true", False), ("", False)])
def test_seul_1_active_la_purge(monkeypatch, brut, attendu):
    monkeypatch.setenv("SYNORIX_PURGE_AO_ACTIVE", brut)
    assert purge_active() is attendu


# ─── Simulation ──────────────────────────────────────────────────────────────

def test_simulation_compte_sans_rien_supprimer(db_session, test_org, racine, caplog):
    _projet(db_session, "vieux", test_org.id, jours_supprime=40)
    _piece(db_session, "vieux", "dce/a.pdf")
    f1 = _ecrire(racine, "vieux", "dce/a.pdf", b"a" * 2048)
    f2 = _ecrire(racine, "vieux", "dpgf_remplie/b.xlsx", b"b" * 1024)
    db_session.commit()

    with caplog.at_level(logging.INFO, logger="services.purge_ao"):
        bilan = _purger(db_session, racine)             # active par défaut = False
    assert bilan.active is False
    assert (bilan.projets, bilan.fichiers, bilan.octets) == (1, 2, 3072)
    assert f1.exists() and f2.exists()
    assert db_session.get(Project, "vieux") is not None
    texte = " ".join(r.getMessage() for r in caplog.records)
    assert "SIMULATION" in texte and "1 projet" in texte
    # Aucune donnée du projet dans le journal : ni nom, ni identifiant, ni fichier.
    for interdit in ("AO secret", "vieux", "a.pdf", "b.xlsx", "projects/"):
        assert interdit not in texte


# ─── Purge réelle ────────────────────────────────────────────────────────────

def test_purge_reelle_supprime_fichiers_et_lignes_du_projet_ancien(db_session, test_org, racine):
    _projet(db_session, "vieux", test_org.id, jours_supprime=31)
    piece = _piece(db_session, "vieux", "dce/a.pdf", pdf_preview_url="/uploads/projects/vieux/dce/a.pdf")
    db_session.add(ComplianceItem(project_id="vieux", exigence_text="x", category="technique",
                                  priority="obligatoire", status="non_couvert"))
    db_session.add(MemoireTechnique(project_id="vieux", content_json={"a": "b"}))
    db_session.flush()
    db_session.add(ChecklistItem(project_id="vieux", document_type_required="kbis",
                                 template_project_doc_id=piece.id))
    _ecrire(racine, "vieux", "dce/a.pdf")
    _ecrire(racine, "vieux", "dce/sous/b.docx")
    db_session.commit()

    bilan = _purger(db_session, racine, active=True)
    assert (bilan.projets, bilan.fichiers, bilan.erreurs) == (1, 2, 0)
    assert not (racine / "projects" / "vieux").exists()
    db_session.expire_all()
    assert db_session.get(Project, "vieux") is None
    for modele in (ProjectDocument, ComplianceItem, ChecklistItem, MemoireTechnique):
        assert db_session.query(modele).filter_by(project_id="vieux").count() == 0
    # idempotent : rien à refaire
    assert _purger(db_session, racine, active=True).projets == 0


def test_projet_recent_ou_non_supprime_est_garde(db_session, test_org, racine):
    _projet(db_session, "recent", test_org.id, jours_supprime=10)
    _projet(db_session, "actif", test_org.id, jours_supprime=None)
    _projet(db_session, "limite", test_org.id, jours_supprime=29)
    fichiers = [_ecrire(racine, p, "dce/a.pdf") for p in ("recent", "actif", "limite")]
    db_session.commit()
    bilan = _purger(db_session, racine, active=True)
    assert bilan.projets == 0
    assert all(f.exists() for f in fichiers)
    assert db_session.query(Project).count() == 3


def test_jours_configurables(db_session, test_org, racine):
    _projet(db_session, "p", test_org.id, jours_supprime=10)
    f = _ecrire(racine, "p", "dce/a.pdf")
    db_session.commit()
    assert _purger(db_session, racine, active=True, jours=30).projets == 0
    assert f.exists()
    assert _purger(db_session, racine, active=True, jours=7).projets == 1
    assert not f.exists()


def test_projet_d_une_autre_organisation_non_touche(db_session, test_org, racine):
    """Ancien projet supprimé de l'org A ; projet récent / actif de l'org B (mêmes noms de
    fichiers) : seul l'ancien part, le reste de B est intact (pas de jointure par nom)."""
    b = Organization(id="org-b", name="Autre BTP")
    db_session.add(b)
    db_session.flush()
    _projet(db_session, "a-vieux", test_org.id, jours_supprime=90)
    _projet(db_session, "b-actif", b.id, jours_supprime=None)
    _projet(db_session, "b-recent", b.id, jours_supprime=5)
    for p in ("a-vieux", "b-actif", "b-recent"):
        _piece(db_session, p, "dce/rc.pdf")
        _ecrire(racine, p, "dce/rc.pdf")
    db_session.add(Document(organization_id=b.id, type="kbis", file_url="/uploads/organizations/org-b/vault/k.pdf",
                            file_name="k.pdf"))
    coffre = racine / "organizations" / "org-b" / "vault" / "k.pdf"
    coffre.parent.mkdir(parents=True)
    coffre.write_bytes(b"kbis")
    db_session.commit()

    bilan = _purger(db_session, racine, active=True)
    assert bilan.projets == 1
    assert not (racine / "projects" / "a-vieux").exists()
    assert (racine / "projects" / "b-actif" / "dce" / "rc.pdf").exists()
    assert (racine / "projects" / "b-recent" / "dce" / "rc.pdf").exists()
    assert coffre.exists()
    db_session.expire_all()
    assert {p.id for p in db_session.query(Project).all()} == {"b-actif", "b-recent"}
    assert db_session.query(ProjectDocument).filter_by(project_id="b-actif").count() == 1
    assert db_session.query(Document).count() == 1


# ─── Sécurité des chemins ────────────────────────────────────────────────────

def test_identifiant_de_traversee_ne_touche_rien_hors_du_dossier(db_session, test_org, racine):
    """Un identifiant forgé en base (« ../organizations ») ne doit JAMAIS faire supprimer le
    dossier visé."""
    cible = racine / "organizations" / "org-b" / "vault"
    cible.mkdir(parents=True)
    (cible / "k.pdf").write_bytes(b"kbis")
    (racine / "secret.txt").write_bytes(b"hors uploads/projects")
    for pid in ("../organizations", "..", "../../..", "../secret.txt"):
        _projet(db_session, pid, test_org.id, jours_supprime=90)
    db_session.commit()

    bilan = _purger(db_session, racine, active=True)
    assert (cible / "k.pdf").exists()
    assert (racine / "secret.txt").exists()
    assert bilan.fichiers == 0


def test_lien_symbolique_n_est_jamais_suivi(db_session, test_org, racine, tmp_path_factory):
    hors = tmp_path_factory.mktemp("hors")
    (hors / "important.pdf").write_bytes(b"important")
    (hors / "dossier").mkdir()
    (hors / "dossier" / "x.pdf").write_bytes(b"x")
    _projet(db_session, "p", test_org.id, jours_supprime=60)
    _ecrire(racine, "p", "dce/a.pdf")
    os.symlink(hors / "important.pdf", racine / "projects" / "p" / "dce" / "lien.pdf")
    os.symlink(hors / "dossier", racine / "projects" / "p" / "dce" / "lien_dossier")
    db_session.commit()

    _purger(db_session, racine, active=True)
    assert (hors / "important.pdf").read_bytes() == b"important"
    assert (hors / "dossier" / "x.pdf").exists()
    assert not (racine / "projects" / "p").exists()       # liens retirés, pas leur cible


def test_dossier_du_projet_lui_meme_lien_symbolique_est_ignore(db_session, test_org, racine, tmp_path_factory):
    hors = tmp_path_factory.mktemp("hors2")
    (hors / "a.pdf").write_bytes(b"a")
    os.symlink(hors, racine / "projects" / "p")
    _projet(db_session, "p", test_org.id, jours_supprime=60)
    db_session.commit()
    bilan = _purger(db_session, racine, active=True)
    assert (hors / "a.pdf").exists()
    assert bilan.ignores == 1 and bilan.projets == 0
    assert db_session.get(Project, "p") is not None


# ─── Pièces encore rattachées ailleurs ───────────────────────────────────────

def test_piece_du_coffre_fort_encore_rattachee_est_conservee(db_session, test_org, racine):
    _projet(db_session, "p", test_org.id, jours_supprime=60)
    _piece(db_session, "p", "dce/kbis.pdf")
    _piece(db_session, "p", "dce/rc.pdf")
    gardee = _ecrire(racine, "p", "dce/kbis.pdf")
    partie = _ecrire(racine, "p", "dce/rc.pdf")
    db_session.add(Document(organization_id=test_org.id, type="kbis", file_name="kbis.pdf",
                            file_url="/uploads/projects/p/dce/kbis.pdf"))
    db_session.commit()

    bilan = _purger(db_session, racine, active=True)
    assert bilan.conserves == 1 and bilan.fichiers == 1
    assert gardee.exists() and not partie.exists()
    assert db_session.get(Project, "p") is None
    assert db_session.query(Document).count() == 1            # le coffre-fort n'est pas touché


def test_piece_partagee_avec_un_autre_ao_non_purge_est_conservee(db_session, test_org, racine):
    _projet(db_session, "vieux", test_org.id, jours_supprime=60)
    _projet(db_session, "actif", test_org.id, jours_supprime=None,
            dpgf_remplie_url="/uploads/projects/vieux/dpgf_remplie/d.xlsx")
    _piece(db_session, "vieux", "dce/commune.pdf")
    _piece(db_session, "actif", "x.pdf").file_url = "/uploads/projects/vieux/dce/commune.pdf"
    commune = _ecrire(racine, "vieux", "dce/commune.pdf")
    dpgf = _ecrire(racine, "vieux", "dpgf_remplie/d.xlsx")
    seule = _ecrire(racine, "vieux", "dce/seule.pdf")
    db_session.commit()

    bilan = _purger(db_session, racine, active=True)
    assert commune.exists() and dpgf.exists()
    assert not seule.exists()
    assert bilan.conserves == 2


def test_fichiers_deja_partis_ne_bloquent_pas_le_retrait_des_lignes(db_session, test_org, racine):
    _projet(db_session, "p", test_org.id, jours_supprime=60)
    _piece(db_session, "p", "dce/a.pdf")                      # jamais écrit sur le disque
    db_session.commit()
    bilan = _purger(db_session, racine, active=True)
    assert bilan.projets == 1 and bilan.erreurs == 0
    assert db_session.get(Project, "p") is None


def test_une_erreur_sur_un_projet_n_arrete_pas_les_suivants(db_session, test_org, racine, monkeypatch):
    import services.purge_ao as mod
    _projet(db_session, "p1", test_org.id, jours_supprime=60)
    _projet(db_session, "p2", test_org.id, jours_supprime=60)
    _ecrire(racine, "p1", "a.pdf")
    _ecrire(racine, "p2", "a.pdf")
    db_session.commit()
    vrai = mod._supprimer_fichiers

    def _plante_sur_p1(fichiers, dossier):
        if dossier.name == "p1":
            raise OSError("disque")
        return vrai(fichiers, dossier)
    monkeypatch.setattr(mod, "_supprimer_fichiers", _plante_sur_p1)
    bilan = _purger(db_session, racine, active=True)
    assert bilan.erreurs == 1
    db_session.expire_all()
    assert db_session.get(Project, "p1") is not None          # réessayé à la prochaine passe
    assert db_session.get(Project, "p2") is None


# ─── Tâche planifiée ─────────────────────────────────────────────────────────

def test_tache_celery_planifiee_et_simulation_par_defaut(db_session, test_org, racine, monkeypatch):
    from tasks import celery_app
    from tasks.check_expiry import celery_app as app2
    assert celery_app is app2
    entree = celery_app.conf.beat_schedule["purge-ao-supprimes-daily"]
    assert entree["task"] == "tasks.purge_ao.purger_ao_supprimes"
    assert entree["task"] in celery_app.tasks

    import services.purge_ao as mod
    monkeypatch.setattr(mod, "_racine_uploads", lambda: racine)
    monkeypatch.delenv("SYNORIX_PURGE_AO_ACTIVE", raising=False)
    _projet(db_session, "vieux", test_org.id, jours_supprime=400)
    f = _ecrire(racine, "vieux", "a.pdf")
    # created at real "now": le projet « supprimé il y a 400 jours » depuis MAINTENANT (2026-11-20)
    db_session.get(Project, "vieux").deleted_at = datetime.utcnow() - timedelta(days=400)
    db_session.commit()
    res = celery_app.tasks[entree["task"]]()
    assert res["active"] is False and res["projets"] == 1
    assert f.exists()
