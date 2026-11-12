"""Seconde relecture du serveur (REVUE-2, 12/11) — paiement et suppression programmée (D23), corrigés ici.

Scénarios de `outils-revue2/test_revue2_paiement.py`, remis à l'endroit : chaque test dit ce qui doit se passer.
Même faux fournisseur que `test_paiement_revue.py` (il garde l'état des abonnements), faux Clerk : aucun appel réel.
"""
from datetime import datetime, timedelta

from models.audit_log import AuditLog
from models.project import Project
from tests.test_paiement_revue import (  # noqa: F401  (fixtures réutilisées)
    FauxFournisseur, _abonnement, _org, _webhook, abonne, poser,
)


def _lignes(db_session, action):
    db_session.expire_all()
    return db_session.query(AuditLog).filter(AuditLog.action == action).all()


# ── P0-1 : une demande échue dont l'abonnement a renouvelé tombe ; « Annuler » reste possible ─────────────────────

def _demande_puis_reprise_pendant_une_panne(client, f):
    """Demande, puis reprise dans le portail ; l'événement `updated` arrive pendant une panne : la demande reste."""
    assert client.delete("/api/users/me").json()["deleted"] is False
    f.abonnements[0]["cancel_at_period_end"] = False
    f.panne = True
    _webhook(client, "customer.subscription.updated",
             {"id": "sub_invente", "customer": "cus_invente", "status": "active", "cancel_at_period_end": False})
    f.panne = False


def test_p0_1_le_filet_retire_une_demande_echue_dont_l_abonnement_a_renouvele(client, abonne, poser, db_session):
    from services import resiliation_compte
    f = FauxFournisseur([_abonnement()])
    poser(f)
    _demande_puis_reprise_pendant_une_panne(client, f)
    assert _org(db_session).suppression_prevue_le is not None
    assert resiliation_compte.executer_suppressions_echues(db_session, maintenant=datetime(2031, 1, 1)) == 0
    assert _org(db_session).suppression_prevue_le is None                # la demande tombe
    lignes = _lignes(db_session, "compte.suppression_retiree")
    assert [(l.organization_id, l.extra.get("raison")) for l in lignes] == [("org-test-1", "abonnement_renouvele")]
    # Des mois plus tard, le client résilie dans le portail : il passe en offre gratuite, rien n'est effacé.
    f.abonnements[0]["status"] = "canceled"
    _webhook(client, "customer.subscription.deleted", {"id": "sub_invente", "customer": "cus_invente"})
    org = _org(db_session)
    assert org is not None and org.plan == "free"
    assert db_session.get(Project, "p-revue") is not None


def test_p0_1_le_filet_garde_une_demande_dont_l_abonnement_s_arrete_toujours(client, abonne, poser, db_session):
    from services import resiliation_compte
    f = FauxFournisseur([_abonnement()])
    poser(f)
    client.delete("/api/users/me")                                       # arrêt à l'échéance, abonnement vivant
    assert resiliation_compte.executer_suppressions_echues(db_session, maintenant=datetime(2031, 1, 1)) == 0
    assert _org(db_session).suppression_prevue_le is not None            # rien de retiré, rien d'effacé
    assert _lignes(db_session, "compte.suppression_retiree") == []


def test_p0_1_le_filet_fournisseur_en_panne_la_demande_reste(client, abonne, poser, db_session):
    from services import resiliation_compte
    f = FauxFournisseur([_abonnement()])
    poser(f)
    _demande_puis_reprise_pendant_une_panne(client, f)
    f.panne = True
    assert resiliation_compte.executer_suppressions_echues(db_session, maintenant=datetime(2031, 1, 1)) == 0
    org = _org(db_session)
    assert org is not None and org.suppression_prevue_le is not None     # ni retirée, ni exécutée : demain


def test_p0_1_annuler_apres_la_date_tant_que_l_organisation_existe(client, abonne, poser, db_session):
    f = FauxFournisseur([_abonnement()])
    poser(f)
    client.delete("/api/users/me")
    org = _org(db_session)
    org.suppression_prevue_le = datetime.utcnow() - timedelta(days=3)    # date passée, rien encore supprimé
    db_session.commit()
    r = client.post("/api/users/me/annuler-suppression")
    assert r.status_code == 200, r.text
    assert r.json()["abonnement_repris"] is True and f.repris == ["sub_invente"]
    assert _org(db_session).suppression_prevue_le is None
