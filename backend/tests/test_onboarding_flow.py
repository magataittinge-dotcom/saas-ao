"""
Tests C15 — contrat de décision de l'onboarding « premier DCE offert ».

Le front affiche l'écran central offert ssi :
  plan free ET trial_granted ET aucune unité consommée.
Essai consommé (ou trial refusé C2) → dashboard normal + CTA upgrade.
"""
from models.quota_consumption import QuotaConsumption


def test_org_me_exposes_trial_granted(client, db_session, test_org):
    resp = client.get("/api/organizations/me")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["trial_granted"] is True
    assert body["plan"] == "free"


def test_fresh_account_state_offers_first_ao(client, db_session, test_org):
    """Nouveau compte : essai intact → l'écran offert doit s'afficher."""
    org = client.get("/api/organizations/me").json()
    quota = client.get("/api/billing/quota").json()
    fresh = (
        org["plan"] == "free" and org["trial_granted"]
        and quota["analyses"]["used"] == 0 and quota["memoires"]["used"] == 0
    )
    assert fresh is True


def test_consumed_trial_state_shows_dashboard(client, db_session, test_org):
    """Essai consommé → dashboard normal (pas l'écran offert)."""
    db_session.add(QuotaConsumption(organization_id=test_org.id, kind="analysis"))
    db_session.commit()

    org = client.get("/api/organizations/me").json()
    quota = client.get("/api/billing/quota").json()
    fresh = (
        org["plan"] == "free" and org["trial_granted"]
        and quota["analyses"]["used"] == 0 and quota["memoires"]["used"] == 0
    )
    assert fresh is False


def test_refused_trial_state_shows_dashboard(client, db_session, test_org):
    """Trial refusé (SIRET doublon, C2) → jamais l'écran offert."""
    test_org.trial_granted = False
    db_session.commit()

    org = client.get("/api/organizations/me").json()
    assert org["trial_granted"] is False
