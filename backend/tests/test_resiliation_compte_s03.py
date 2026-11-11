"""S-03 (audit de sécurité, P1) — supprimer son compte résilie l'abonnement (avant) et supprime l'utilisateur Clerk
(après). Faux fournisseur de paiement et faux Clerk : aucun appel réel à Stripe ni à Clerk."""
import pytest

from models.organization import Organization
from models.project import Project
from models.user import User


class FauxFournisseur:
    def __init__(self, panne=False, abonnements=()):
        self.panne = panne
        self.resilies = []
        self.abonnements = list(abonnements)

    def list_subscriptions(self, customer_id):
        if self.panne:
            raise RuntimeError("fournisseur injoignable")
        return self.abonnements

    def cancel_subscription(self, subscription_id, at_period_end=True):
        if self.panne:
            raise RuntimeError("fournisseur injoignable")
        self.resilies.append((subscription_id, at_period_end))


class FauxClerk:
    def __init__(self, statut=200, panne=False):
        self.statut, self.panne, self.appels = statut, panne, []

    def delete(self, url, headers=None, timeout=None):
        self.appels.append(url)
        if self.panne:
            raise OSError("Clerk injoignable")
        return type("R", (), {"status_code": self.statut})()


@pytest.fixture
def abonne(db_session, test_org, test_user):
    org = db_session.get(Organization, test_org.id)
    org.plan, org.stripe_customer_id, org.stripe_subscription_id = "pro", "cus_invente", "sub_invente"
    db_session.get(User, test_user.id).clerk_id = "user_clerk_invente"
    db_session.add(Project(id="p-s03", organization_id=test_org.id, name="AO"))
    db_session.commit()


@pytest.fixture
def fournisseurs(monkeypatch):
    import httpx
    from services.billing import factory

    def poser(fournisseur, clerk):
        monkeypatch.setattr(factory, "get_billing_provider", lambda: fournisseur)
        monkeypatch.setattr(httpx, "delete", clerk.delete)
    return poser


def test_resiliation_puis_suppression_puis_clerk(client, abonne, fournisseurs, db_session):
    f = FauxFournisseur(abonnements=[{"id": "sub_invente", "status": "active"},
                                     {"id": "sub_double", "status": "active"},
                                     {"id": "sub_vieux", "status": "canceled"}])
    c = FauxClerk()
    fournisseurs(f, c)
    r = client.delete("/api/users/me")
    assert r.status_code == 200, r.text
    assert sorted(f.resilies) == [("sub_double", False), ("sub_invente", False)]   # immédiate, les deux vivants
    assert c.appels == ["https://api.clerk.com/v1/users/user_clerk_invente"]
    db_session.expire_all()
    assert db_session.get(Organization, "org-test-1") is None


def test_echec_du_fournisseur_502_et_rien_n_est_supprime(client, abonne, fournisseurs, db_session):
    c = FauxClerk()
    fournisseurs(FauxFournisseur(panne=True), c)
    r = client.delete("/api/users/me")
    assert r.status_code == 502
    assert "rien n’a été supprimé" in r.json()["detail"]
    db_session.expire_all()
    assert db_session.get(Organization, "org-test-1") is not None
    assert db_session.get(Project, "p-s03") is not None
    assert c.appels == []


def test_echec_de_clerk_journalise_suppression_acquise(client, abonne, fournisseurs, db_session, caplog):
    fournisseurs(FauxFournisseur(), FauxClerk(panne=True))
    r = client.delete("/api/users/me")
    assert r.status_code == 200
    db_session.expire_all()
    assert db_session.get(Organization, "org-test-1") is None
    assert any("Clerk non supprimé" in rec.getMessage() for rec in caplog.records)
    assert not any("user_clerk_invente" in rec.getMessage() or "test@example.com" in rec.getMessage()
                   for rec in caplog.records)


def test_sans_abonnement_aucun_appel_au_fournisseur(client, test_user, fournisseurs, db_session):
    f = FauxFournisseur(panne=True)          # serait une panne s'il était appelé
    fournisseurs(f, FauxClerk())
    assert client.delete("/api/users/me").status_code == 200
