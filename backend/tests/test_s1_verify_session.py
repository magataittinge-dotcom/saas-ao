"""S1.1 — verify-session : bypass de paiement (audit passe 2, 🔴 C1/H1).

verify-session appliquait `org.plan = plan` à l'org APPELANTE à partir de
n'importe quelle session Stripe payée, sans vérifier que la session appartient
à cette org. Un free user rejouant le session_id payé d'une AUTRE org (fuite
via success_url ?session_id=... / historique / Referer) s'upgradait en
business (illimité) sans payer. Une session payée pouvait upgrader N orgs.

Fix : la session doit être liée à l'org du JWT (metadata.organization_id ou
client_reference_id). Sinon → 403, plan inchangé.
"""
from models.organization import Organization


class _FakeBilling:
    """retrieve_session renvoie la session fournie (contrôle du test)."""
    def __init__(self, session: dict):
        self._session = session

    def retrieve_session(self, session_id):
        return self._session

    def retrieve_subscription(self, subscription_id):
        return {"items": {"data": []}}


def _patch(monkeypatch, session):
    monkeypatch.setattr(
        "routers.stripe_billing.get_billing_provider", lambda: _FakeBilling(session)
    )


def test_verify_session_rejects_other_orgs_session(client, db_session, test_org, monkeypatch):
    """EXPLOIT — session payée d'une AUTRE org réclamée par l'appelant."""
    assert db_session.get(Organization, test_org.id).plan == "free"

    other_org_session = {
        "payment_status": "paid",
        "metadata": {"organization_id": "org-de-quelqun-dautre", "plan": "business"},
        "customer": "cus_victim",
        "subscription": "sub_victim",
    }
    _patch(monkeypatch, other_org_session)

    resp = client.get("/api/stripe/verify-session?session_id=cs_stolen")
    assert resp.status_code == 403, resp.text

    db_session.expire_all()
    org = db_session.get(Organization, test_org.id)
    assert org.plan == "free", "une session d'autrui ne doit JAMAIS upgrader l'org"
    assert org.stripe_customer_id != "cus_victim"


def test_verify_session_rejects_session_without_org_binding(client, db_session, test_org, monkeypatch):
    """Session sans liaison d'org (forgée / incomplète) → refus, pas d'upgrade."""
    unbound = {
        "payment_status": "paid",
        "metadata": {"plan": "business"},  # pas d'organization_id
        "customer": "cus_x",
        "subscription": "sub_x",
    }
    _patch(monkeypatch, unbound)

    resp = client.get("/api/stripe/verify-session?session_id=cs_unbound")
    assert resp.status_code == 403, resp.text
    db_session.expire_all()
    assert db_session.get(Organization, test_org.id).plan == "free"


def test_verify_session_accepts_own_paid_session(client, db_session, test_org, monkeypatch):
    """LÉGITIME — session liée à l'org appelante → upgrade appliqué."""
    own_session = {
        "payment_status": "paid",
        "metadata": {"organization_id": test_org.id, "plan": "pro"},
        "customer": "cus_self",
        "subscription": "sub_self",
    }
    _patch(monkeypatch, own_session)

    resp = client.get("/api/stripe/verify-session?session_id=cs_own")
    assert resp.status_code == 200, resp.text
    assert resp.json()["plan"] == "pro"

    db_session.expire_all()
    org = db_session.get(Organization, test_org.id)
    assert org.plan == "pro"
    assert org.stripe_customer_id == "cus_self"


def test_verify_session_accepts_via_client_reference_id(client, db_session, test_org, monkeypatch):
    """Liaison alternative : client_reference_id == org (pas de metadata org)."""
    own_session = {
        "payment_status": "paid",
        "client_reference_id": test_org.id,
        "metadata": {"plan": "business"},
        "customer": "cus_self2",
        "subscription": "sub_self2",
    }
    _patch(monkeypatch, own_session)

    resp = client.get("/api/stripe/verify-session?session_id=cs_ref")
    assert resp.status_code == 200, resp.text
    db_session.expire_all()
    assert db_session.get(Organization, test_org.id).plan == "business"
