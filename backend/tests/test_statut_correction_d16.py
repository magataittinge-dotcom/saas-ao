"""D16 (DECISIONS.md) — « Gagné » et « Perdu » se corrigent.

Avant : gagné et perdu étaient terminaux ; un clic sur le mauvais choix faussait pour toujours le bilan et le taux de
réussite. Désormais : gagné ↔ perdu, et retour à « Déposé » (soumis) depuis l'un ou l'autre. Chaque changement de
statut est journalisé (journal d'audit daté, ancien et nouveau statut) ; la date de dépôt n'est pas réécrite par une
correction ; le bilan du tableau de bord suit. Les autres sorties de gagné/perdu restent interdites (422)."""
from datetime import datetime, timedelta

from models.audit_log import AuditLog
from models.project import Project


def _ao(db, org_id, pid, status, depose_at=None):
    db.add(Project(id=pid, organization_id=org_id, name=f"AO {pid}", status=status, depose_at=depose_at))
    db.commit()


def _statut(client, pid, status):
    return client.patch(f"/api/projects/{pid}", json={"status": status})


def test_gagne_devient_perdu_et_inversement(client, db_session, test_org):
    _ao(db_session, test_org.id, "p-d16a", "gagné")
    assert _statut(client, "p-d16a", "perdu").status_code == 200
    assert _statut(client, "p-d16a", "gagné").status_code == 200
    db_session.expire_all()
    assert db_session.get(Project, "p-d16a").status == "gagné"


def test_retour_a_depose_garde_la_date_de_depot(client, db_session, test_org):
    depot = datetime.utcnow() - timedelta(days=40)
    _ao(db_session, test_org.id, "p-d16b", "perdu", depose_at=depot)
    r = _statut(client, "p-d16b", "soumis")
    assert r.status_code == 200
    db_session.expire_all()
    p = db_session.get(Project, "p-d16b")
    assert p.status == "soumis"
    assert p.depose_at == depot                  # une correction n'invente pas un nouveau dépôt


def test_les_autres_sorties_restent_interdites(client, db_session, test_org):
    _ao(db_session, test_org.id, "p-d16c", "gagné")
    for cible in ("en_cours", "brouillon", "analyzed", "sans_suite"):
        r = _statut(client, "p-d16c", cible)
        assert r.status_code == 422, cible
    _ao(db_session, test_org.id, "p-d16d", "analyzed")
    assert _statut(client, "p-d16d", "gagné").status_code == 422     # gagné sans dépôt : toujours interdit


def test_chaque_changement_de_statut_est_journalise(client, db_session, test_org):
    _ao(db_session, test_org.id, "p-d16e", "gagné")
    _statut(client, "p-d16e", "perdu")
    _statut(client, "p-d16e", "soumis")
    lignes = (db_session.query(AuditLog).filter(AuditLog.action == "project.status", AuditLog.target_id == "p-d16e")
              .order_by(AuditLog.created_at).all())
    assert [(l.extra["de"], l.extra["vers"]) for l in lignes] == [("gagné", "perdu"), ("perdu", "soumis")]
    assert all(l.created_at is not None and l.organization_id == test_org.id for l in lignes)


def test_le_bilan_suit_la_correction(client, db_session, test_org):
    _ao(db_session, test_org.id, "p-d16f", "gagné")
    _ao(db_session, test_org.id, "p-d16g", "gagné")
    _ao(db_session, test_org.id, "p-d16h", "perdu")
    avant = client.get("/api/dashboard/stats").json()
    assert (avant["projects_gagnes"], avant["taux_succes"]) == (2, 67)
    assert _statut(client, "p-d16g", "perdu").status_code == 200       # erreur de saisie corrigée
    apres = client.get("/api/dashboard/stats").json()
    assert (apres["projects_gagnes"], apres["taux_succes"]) == (1, 33)
    assert _statut(client, "p-d16h", "soumis").status_code == 200      # le résultat n'est pas encore connu
    fin = client.get("/api/dashboard/stats").json()
    assert (fin["projects_gagnes"], fin["taux_succes"]) == (1, 50)
