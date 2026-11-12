"""D23 (décision du fondateur, 12/11) — « Supprimer mon compte » avec un abonnement payant vivant attend la fin de la
période payée : l'abonnement est mis en arrêt à l'échéance, la demande et la date sont posées sur l'organisation
(`suppression_prevue_le`), rien n'est effacé, l'accès reste ouvert. La suppression se fait au webhook
`customer.subscription.deleted` (seulement s'il y a une demande), ou, à défaut, par la tâche quotidienne une fois la
date passée. La demande s'annule tant que la date n'est pas passée. Sans abonnement payant vivant : suppression
immédiate, comme avant. Faux fournisseur de paiement et faux Clerk : aucun appel réel à Stripe ni à Clerk."""
import json
from datetime import datetime, timedelta

import pytest

from models.organization import Organization
from models.project import Project
from models.user import User

FIN = int(datetime(2030, 3, 14, 10, 0).timestamp())        # fin de période (horodatage Stripe, secondes)


class FauxFournisseur:
    def __init__(self, abonnements=(), panne=False):
        self.abonnements = [dict(a) for a in abonnements]
        self.panne = panne
        self.resilies, self.repris = [], []

    def _verifier(self):
        if self.panne:
            raise RuntimeError("fournisseur injoignable")

    def list_subscriptions(self, customer_id):
        self._verifier()
        return self.abonnements

    def retrieve_subscription(self, subscription_id):
        self._verifier()
        return next(a for a in self.abonnements if a["id"] == subscription_id)

    def cancel_subscription(self, subscription_id, at_period_end=True):
        self._verifier()
        self.resilies.append((subscription_id, at_period_end))

    def resume_subscription(self, subscription_id):
        self._verifier()
        self.repris.append(subscription_id)

    def verify_webhook(self, payload, signature):
        return json.loads(payload)


class FauxClerk:
    def __init__(self):
        self.appels = []

    def delete(self, url, headers=None, timeout=None):
        self.appels.append(url)
        return type("R", (), {"status_code": 200})()


ACTIF = {"id": "sub_invente", "status": "active", "current_period_end": FIN, "customer": "cus_invente"}


@pytest.fixture
def abonne(db_session, test_org, test_user):
    org = db_session.get(Organization, test_org.id)
    org.plan, org.stripe_customer_id, org.stripe_subscription_id = "pro", "cus_invente", "sub_invente"
    db_session.get(User, test_user.id).clerk_id = "user_clerk_invente"
    db_session.add(Project(id="p-d23", organization_id=test_org.id, name="AO"))
    db_session.commit()
    return org


@pytest.fixture
def poser(monkeypatch):
    import httpx

    import routers.stripe_billing as sb
    from services.billing import factory

    def _poser(fournisseur, clerk=None):
        clerk = clerk or FauxClerk()
        monkeypatch.setattr(factory, "get_billing_provider", lambda: fournisseur)
        monkeypatch.setattr(sb, "get_billing_provider", lambda: fournisseur)
        monkeypatch.setattr(sb.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test", raising=False)
        monkeypatch.setattr(httpx, "delete", clerk.delete)
        return clerk
    return _poser


def _org(db_session):
    db_session.expire_all()
    return db_session.get(Organization, "org-test-1")


def _webhook(client, type_, objet):
    return client.post("/api/stripe/webhook", json={"type": type_, "data": {"object": objet}},
                       headers={"stripe-signature": "t=1,v1=ok"})


# ── 2. Avec un abonnement payant vivant : la suppression est programmée ─────────────────────────────

def test_avec_abonnement_la_suppression_est_programmee(client, abonne, poser, db_session):
    f = FauxFournisseur([ACTIF, {"id": "sub_double", "status": "active", "current_period_end": FIN - 3600},
                         {"id": "sub_vieux", "status": "canceled"}])
    clerk = poser(f)
    r = client.delete("/api/users/me")
    assert r.status_code == 200, r.text
    corps = r.json()
    assert corps["deleted"] is False
    assert corps["suppression_prevue_le"].startswith("2030-03-14")
    assert sorted(f.resilies) == [("sub_double", True), ("sub_invente", True)]      # à l'échéance, les deux vivants
    org = _org(db_session)
    assert org is not None and org.plan == "pro"                                     # l'accès reste ouvert
    assert org.suppression_prevue_le is not None
    assert db_session.get(Project, "p-d23") is not None                              # rien n'est effacé
    assert clerk.appels == []


def test_avec_abonnement_api_recente_fin_de_periode_lue_sur_les_lignes(client, abonne, poser, db_session):
    """Versions récentes de l'API Stripe : `current_period_end` est porté par les lignes de l'abonnement."""
    sub = {"id": "sub_invente", "status": "active", "items": {"data": [{"current_period_end": FIN}]}}
    poser(FauxFournisseur([sub]))
    r = client.delete("/api/users/me")
    assert r.json()["suppression_prevue_le"].startswith("2030-03-14")


def test_echec_du_fournisseur_502_rien_ne_change(client, abonne, poser, db_session):
    poser(FauxFournisseur([ACTIF], panne=True))
    r = client.delete("/api/users/me")
    assert r.status_code == 502
    org = _org(db_session)
    assert org is not None and org.suppression_prevue_le is None


def test_l_etat_se_lit_dans_le_quota(client, abonne, poser, db_session):
    poser(FauxFournisseur([ACTIF]))
    assert client.get("/api/billing/quota").json()["suppression_prevue_le"] is None
    client.delete("/api/users/me")
    assert client.get("/api/billing/quota").json()["suppression_prevue_le"].startswith("2030-03-14")


# ── 3. À la fin de la période : le webhook supprime, seulement s'il y a une demande ───────────────────

def test_webhook_fin_d_abonnement_avec_demande_supprime_tout(client, abonne, poser, db_session):
    f = FauxFournisseur([ACTIF])
    clerk = poser(f)
    client.delete("/api/users/me")
    f.abonnements = [dict(ACTIF, status="canceled")]                                 # l'échéance est passée
    r = _webhook(client, "customer.subscription.deleted", {"id": "sub_invente", "customer": "cus_invente"})
    assert r.status_code == 200, r.text
    assert _org(db_session) is None
    assert db_session.get(Project, "p-d23") is None
    assert clerk.appels == ["https://api.clerk.com/v1/users/user_clerk_invente"]
    # Idempotent : rejoué, pas d'erreur.
    assert _webhook(client, "customer.subscription.deleted",
                    {"id": "sub_invente", "customer": "cus_invente"}).status_code == 200


def test_webhook_fin_d_abonnement_sans_demande_ne_supprime_rien(client, abonne, poser, db_session):
    poser(FauxFournisseur([dict(ACTIF, status="canceled")]))
    r = _webhook(client, "customer.subscription.deleted", {"id": "sub_invente", "customer": "cus_invente"})
    assert r.status_code == 200
    org = _org(db_session)
    assert org is not None and org.plan == "free"                                    # repasse en offre gratuite
    assert db_session.get(Project, "p-d23") is not None


def test_webhook_un_autre_abonnement_encore_vivant_on_attend(client, abonne, poser, db_session):
    f = FauxFournisseur([ACTIF, {"id": "sub_double", "status": "active", "current_period_end": FIN}])
    poser(f)
    client.delete("/api/users/me")
    f.abonnements = [dict(ACTIF, status="canceled"), {"id": "sub_double", "status": "active"}]
    _webhook(client, "customer.subscription.deleted", {"id": "sub_invente", "customer": "cus_invente"})
    org = _org(db_session)
    assert org is not None and org.suppression_prevue_le is not None


def test_reprise_depuis_le_portail_retire_la_demande(client, abonne, poser, db_session):
    poser(FauxFournisseur([ACTIF]))
    client.delete("/api/users/me")
    _webhook(client, "customer.subscription.updated",
             {"id": "sub_invente", "customer": "cus_invente", "status": "active", "cancel_at_period_end": False})
    assert _org(db_session).suppression_prevue_le is None


# ── Filet : la tâche quotidienne exécute une demande échue si le webhook n'est jamais arrivé ──────────

def test_filet_quotidien_execute_une_demande_echue(client, abonne, poser, db_session):
    from services import resiliation_compte
    f = FauxFournisseur([ACTIF])
    clerk = poser(f)
    client.delete("/api/users/me")
    assert resiliation_compte.executer_suppressions_echues(db_session) == 0          # pas encore échue
    assert _org(db_session) is not None
    f.abonnements = [dict(ACTIF, status="canceled")]
    plus_tard = datetime(2030, 3, 15)
    assert resiliation_compte.executer_suppressions_echues(db_session, maintenant=plus_tard) == 1
    assert _org(db_session) is None
    assert clerk.appels == ["https://api.clerk.com/v1/users/user_clerk_invente"]


def test_filet_ne_supprime_pas_si_l_abonnement_vit_encore_ou_si_le_fournisseur_est_en_panne(
        client, abonne, poser, db_session):
    from services import resiliation_compte
    f = FauxFournisseur([ACTIF])
    poser(f)
    client.delete("/api/users/me")
    plus_tard = datetime(2030, 3, 15)
    assert resiliation_compte.executer_suppressions_echues(db_session, maintenant=plus_tard) == 0
    f.panne = True
    assert resiliation_compte.executer_suppressions_echues(db_session, maintenant=plus_tard) == 0
    assert _org(db_session) is not None


def test_la_tache_quotidienne_est_planifiee():
    import tasks
    from tasks.check_expiry import celery_app
    noms = {e["task"] for e in celery_app.conf.beat_schedule.values()}
    assert "tasks.suppression_comptes.executer_suppressions_echues" in noms
    assert hasattr(tasks, "executer_suppressions_echues_tache")


# ── 4. Annuler la demande tant que la date n'est pas passée ───────────────────────────────────────────

def test_annuler_la_suppression_remet_l_abonnement_en_renouvellement(client, abonne, poser, db_session):
    f = FauxFournisseur([ACTIF])
    poser(f)
    client.delete("/api/users/me")
    f.abonnements = [dict(ACTIF, cancel_at_period_end=True)]
    r = client.post("/api/users/me/annuler-suppression")
    assert r.status_code == 200, r.text
    assert r.json()["suppression_prevue_le"] is None
    assert f.repris == ["sub_invente"]
    assert _org(db_session).suppression_prevue_le is None


def test_annuler_sans_demande_409(client, abonne, poser):
    poser(FauxFournisseur([ACTIF]))
    assert client.post("/api/users/me/annuler-suppression").status_code == 409


def test_annuler_date_passee_409(client, abonne, poser, db_session):
    poser(FauxFournisseur([ACTIF]))
    org = db_session.get(Organization, "org-test-1")
    org.suppression_prevue_le = datetime.utcnow() - timedelta(hours=1)
    db_session.commit()
    assert client.post("/api/users/me/annuler-suppression").status_code == 409


def test_annuler_echec_du_fournisseur_502_la_demande_reste(client, abonne, poser, db_session):
    f = FauxFournisseur([ACTIF])
    poser(f)
    client.delete("/api/users/me")
    f.panne = True
    assert client.post("/api/users/me/annuler-suppression").status_code == 502
    assert _org(db_session).suppression_prevue_le is not None


# ── 1. Sans abonnement payant vivant : immédiat ───────────────────────────────────────────────────────

def test_abonnement_deja_termine_suppression_immediate(client, abonne, poser, db_session):
    poser(FauxFournisseur([dict(ACTIF, status="canceled")]))
    r = client.delete("/api/users/me")
    assert r.status_code == 200
    assert r.json()["deleted"] is True
    assert _org(db_session) is None


def test_sans_client_chez_le_fournisseur_suppression_immediate(client, test_user, poser, db_session):
    poser(FauxFournisseur(panne=True))                                               # serait une panne s'il était appelé
    r = client.delete("/api/users/me")
    assert r.status_code == 200 and r.json()["deleted"] is True


# ── 7. Ce que le dialogue annonce avant de confirmer (un appel au fournisseur, à l'ouverture du dialogue) ─────

def test_apercu_avec_abonnement_donne_la_date_sans_rien_changer(client, abonne, poser, db_session):
    f = FauxFournisseur([ACTIF])
    poser(f)
    r = client.get("/api/users/me/suppression")
    assert r.status_code == 200, r.text
    corps = r.json()
    assert corps["immediate"] is False
    assert corps["fin_de_periode"].startswith("2030-03-14")
    assert corps["suppression_prevue_le"] is None
    assert f.resilies == []
    assert _org(db_session).suppression_prevue_le is None


def test_apercu_sans_abonnement_immediate(client, test_user, poser):
    poser(FauxFournisseur(panne=True))
    corps = client.get("/api/users/me/suppression").json()
    assert corps["immediate"] is True and corps["fin_de_periode"] is None


def test_apercu_panne_du_fournisseur_502(client, abonne, poser):
    poser(FauxFournisseur([ACTIF], panne=True))
    assert client.get("/api/users/me/suppression").status_code == 502


# ── Isolation entre organisations ─────────────────────────────────────────────────────────────────────

def test_cross_org_la_demande_d_une_autre_organisation_n_est_ni_lue_ni_annulee(client, abonne, poser, db_session):
    autre = Organization(id="org-autre-d23", name="Autre", plan="pro", stripe_customer_id="cus_autre",
                         suppression_prevue_le=datetime(2030, 3, 14))
    db_session.add(autre)
    db_session.add(Project(id="p-autre-d23", organization_id="org-autre-d23", name="AO autre"))
    db_session.commit()
    f = FauxFournisseur([ACTIF])
    poser(f)
    assert client.get("/api/billing/quota").json()["suppression_prevue_le"] is None
    assert client.get("/api/users/me/suppression").json()["suppression_prevue_le"] is None
    assert client.post("/api/users/me/annuler-suppression").status_code == 409
    # la fin d'abonnement de NOTRE client ne touche pas l'autre organisation
    _webhook(client, "customer.subscription.deleted", {"id": "sub_invente", "customer": "cus_invente"})
    db_session.expire_all()
    assert db_session.get(Organization, "org-autre-d23").suppression_prevue_le is not None
    assert db_session.get(Project, "p-autre-d23") is not None
    assert f.repris == []
