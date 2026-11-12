"""Recette finale (paiement en mode test de Stripe, joué sur le banc) : après « Payer et s'abonner », Stripe renvoyait
sur /billing?success=true&session_id=… ; le front redirige /billing vers /settings/billing SANS la requête
(App.tsx, <Navigate to="/settings/billing" replace />) : la page ne voyait ni « success » ni « session_id »,
n'appelait pas /stripe/verify-session, et l'offre restait « Essai » jusqu'au webhook. Les URL de retour visent
désormais la page elle-même, /settings/billing."""
import routers.stripe_billing as sb


class _Faux:
    def __init__(self):
        self.appels = {}

    def get_default_price_for_product(self, product_id):
        return "price_faux"

    def create_checkout_session(self, customer_id, price_id, success_url, cancel_url, metadata=None,
                                client_reference_id=None):
        self.appels.update(success_url=success_url, cancel_url=cancel_url)
        return "https://paiement.invalid/session"

    def create_portal_session(self, customer_id, return_url):
        self.appels["return_url"] = return_url
        return "https://paiement.invalid/portail"


def test_retours_de_stripe_visent_la_page_abonnement_avec_leurs_parametres(client, db_session, test_org, monkeypatch):
    faux = _Faux()
    monkeypatch.setattr(sb, "get_billing_provider", lambda: faux)
    monkeypatch.setattr(sb, "_get_or_create_customer", lambda org, user: "cus_faux")
    monkeypatch.setattr(sb.settings, "FRONTEND_URL", "https://app.invalid")
    r = client.post("/api/stripe/create-checkout-session", json={"plan": "pro"})
    assert r.status_code == 200, r.text
    assert faux.appels["success_url"] == "https://app.invalid/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}"
    assert faux.appels["cancel_url"] == "https://app.invalid/settings/billing?canceled=true"
    assert client.get("/api/stripe/portal").status_code == 200
    assert faux.appels["return_url"] == "https://app.invalid/settings/billing"
