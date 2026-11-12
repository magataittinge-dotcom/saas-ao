"""P2-2 (REVUE-FRONT) : /auth/me renvoyait toute la ligne de l'organisation, identifiants Stripe compris, et le front la
gardait dans localStorage après la session. Les colonnes de facturation et de cycle de vie, qu'aucun écran ne lit
(vérifié par grep dans frontend/src), ne sortent plus ; le profil de l'entreprise (Mon entreprise) reste."""
from datetime import datetime

COLONNES_PRIVEES = {
    "stripe_customer_id", "stripe_subscription_id", "billing_provider", "billing_country",
    "subscription_started_at", "suppression_prevue_le",
}


def test_auth_me_sans_colonnes_de_facturation(client, db_session, test_org):
    test_org.stripe_customer_id = "cus_essai_prive"
    test_org.stripe_subscription_id = "sub_essai_prive"
    test_org.subscription_started_at = datetime(2026, 11, 1)
    db_session.commit()
    r = client.get("/api/auth/me")
    assert r.status_code == 200
    org = r.json()["organization"]
    assert COLONNES_PRIVEES.isdisjoint(org), sorted(COLONNES_PRIVEES & set(org))
    assert "cus_essai_prive" not in r.text and "sub_essai_prive" not in r.text
    # ce que les écrans lisent reste là
    for c in ("id", "name", "plan", "trial_granted", "siret", "siret_verified", "created_at", "presentation", "address"):
        assert c in org, c
    user = r.json()["user"]
    assert set(user) >= {"id", "email", "name", "role", "organization_id"}


def test_organizations_me_sans_colonnes_de_facturation(client, db_session, test_org):
    test_org.stripe_customer_id = "cus_essai_prive"
    db_session.commit()
    r = client.get("/api/organizations/me")
    assert r.status_code == 200
    assert COLONNES_PRIVEES.isdisjoint(r.json())
