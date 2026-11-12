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


# ── P1-1 : une seconde demande ne fait rien ; la mémoire de l'arrêt n'est jamais écrasée ; réessai après un 502 ─────

def test_p1_1_une_seconde_demande_rend_la_meme_reponse_sans_rien_reecrire(client, abonne, poser, db_session):
    f = FauxFournisseur([_abonnement()])
    poser(f)
    premiere = client.delete("/api/users/me")
    seconde = client.delete("/api/users/me")                              # 2e onglet, double clic, « Réessayez »
    assert seconde.status_code == 200 and seconde.json() == premiere.json()
    assert f.resilies == [("sub_invente", True)]                         # le fournisseur n'est touché qu'une fois
    lignes = _lignes(db_session, "compte.suppression_programmee")
    assert [l.extra["abonnements_arretes"] for l in lignes] == [["sub_invente"]]
    assert client.get("/api/users/me/suppression").json()["abonnement_repris"] is True
    r = client.post("/api/users/me/annuler-suppression")
    assert r.status_code == 200 and r.json()["abonnement_repris"] is True
    assert f.repris == ["sub_invente"] and f.abonnements[0]["cancel_at_period_end"] is False


def test_p1_1_une_trace_vide_n_efface_pas_la_memoire_de_l_arret(client, abonne, db_session):
    """Données d'avant ce correctif : une 2e trace `[]` après la vraie. L'union des traces de la demande en cours."""
    from services import resiliation_compte
    org = _org(db_session)
    resiliation_compte.noter_demande(db_session, org, None, ["sub_invente"])
    db_session.commit()
    resiliation_compte.noter_demande(db_session, org, None, [])
    db_session.commit()
    assert resiliation_compte.abonnements_arretes_par_la_demande(db_session, org) == ["sub_invente"]
    # Après une annulation, une nouvelle demande repart de zéro (l'ancienne trace n'est plus lue).
    resiliation_compte.retirer_demande(db_session, org, "annulee")
    db_session.commit()
    assert resiliation_compte.abonnements_arretes_par_la_demande(db_session, org) is None
    resiliation_compte.noter_demande(db_session, org, None, [])
    db_session.commit()
    assert resiliation_compte.abonnements_arretes_par_la_demande(db_session, org) == []


class FournisseurQuiAppliquePuisExpire(FauxFournisseur):
    """Le fournisseur applique l'arrêt, mais sa réponse se perd (délai réseau) : le serveur reçoit une erreur."""

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.premier = True

    def cancel_subscription(self, subscription_id, at_period_end=True):
        super().cancel_subscription(subscription_id, at_period_end)
        if self.premier:
            self.premier = False
            raise RuntimeError("délai dépassé")


def test_p1_1_reponse_perdue_502_puis_reessai_l_annulation_reprend_l_abonnement(client, abonne, poser, db_session):
    f = FournisseurQuiAppliquePuisExpire([_abonnement()])
    poser(f)
    assert client.delete("/api/users/me").status_code == 502             # « rien n'a été supprimé »
    assert f.abonnements[0]["cancel_at_period_end"] is True              # mais l'arrêt est appliqué
    assert _org(db_session).suppression_prevue_le is None
    assert client.delete("/api/users/me").json()["deleted"] is False     # le client réessaie
    lignes = _lignes(db_session, "compte.suppression_programmee")
    assert [l.extra["abonnements_arretes"] for l in lignes] == [["sub_invente"]]
    r = client.post("/api/users/me/annuler-suppression")
    assert r.status_code == 200 and r.json()["abonnement_repris"] is True
    assert f.repris == ["sub_invente"] and f.abonnements[0]["cancel_at_period_end"] is False


def test_p1_1_reessai_n_attribue_pas_a_la_demande_un_arret_fait_par_le_client(client, abonne, poser, db_session):
    """Sans tentative échouée, un abonnement déjà arrêté reste celui du client (P1-3 de la première relecture)."""
    f = FauxFournisseur([_abonnement(cancel_at_period_end=True)])
    poser(f)
    assert client.delete("/api/users/me").json()["deleted"] is False
    assert [l.extra["abonnements_arretes"] for l in _lignes(db_session, "compte.suppression_programmee")] == [[]]
    assert client.post("/api/users/me/annuler-suppression").json()["abonnement_repris"] is False
    assert f.repris == []
