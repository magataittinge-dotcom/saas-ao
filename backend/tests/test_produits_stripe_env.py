"""Restes-2, point 1 — les produits Stripe des offres viennent de l'environnement.

Les identifiants Pro et Business étaient écrits dans le code (ceux du mode test
du compte de développement). Avec une clé de production, ces produits
n'existent pas : le paiement répondait « Tarif indisponible pour ce plan ».

Modèle retenu (le plus sûr) :
  • STRIPE_PRODUCT_PRO / STRIPE_PRODUCT_BUSINESS renseignés → eux, quelle que soit la clé ;
  • vides avec une clé de test (ou sans clé) → produits du mode test d'aujourd'hui ;
  • vides avec une clé de production → aucun produit (503 explicite « pas encore
    ouverte au paiement en ligne »), et hors DEBUG l'API refuse de démarrer.
"""
import pytest
from pydantic import ValidationError

from config import PRODUITS_STRIPE_MODE_TEST, Settings


def _settings(**over):
    base = dict(
        _env_file=None,
        DEBUG=True,
        SECRET_KEY="a" * 64,
        DATABASE_URL="sqlite:///ignore.db",
        ANTHROPIC_API_KEY="sk-ant-test",
    )
    base.update(over)
    return Settings(**base)


def _prod(**over):
    base = dict(
        DEBUG=False,
        CLERK_JWKS_URL="https://clerk.synorix.tech/.well-known/jwks.json",
        CLERK_SECRET_KEY="sk_live_x",
        STRIPE_WEBHOOK_SECRET="whsec_x",
        FRONTEND_URL="https://synorix.tech",
    )
    base.update(over)
    return _settings(**base)


def test_cle_de_test_sans_variable_garde_les_produits_du_mode_test():
    from routers.stripe_billing import produits_stripe
    produits = produits_stripe(_settings(STRIPE_SECRET_KEY="sk_test_invente"))
    assert produits["pro"] == PRODUITS_STRIPE_MODE_TEST["pro"]
    assert produits["business"] == PRODUITS_STRIPE_MODE_TEST["business"]
    assert "essentiel" not in produits


def test_variables_renseignees_priment():
    from routers.stripe_billing import produits_stripe
    produits = produits_stripe(_settings(
        STRIPE_SECRET_KEY="sk_live_invente",
        STRIPE_PRODUCT_ESSENTIEL="prod_essentiel_invente",
        STRIPE_PRODUCT_PRO="prod_pro_invente",
        STRIPE_PRODUCT_BUSINESS="prod_business_invente",
    ))
    assert produits == {
        "essentiel": "prod_essentiel_invente",
        "pro": "prod_pro_invente",
        "business": "prod_business_invente",
    }


@pytest.mark.parametrize("cle", ["sk_live_invente", "rk_live_invente"])
def test_cle_de_production_n_utilise_jamais_les_produits_du_mode_test(cle):
    from routers.stripe_billing import produits_stripe
    produits = produits_stripe(_settings(STRIPE_SECRET_KEY=cle))
    assert produits == {}
    assert not set(produits.values()) & set(PRODUITS_STRIPE_MODE_TEST.values())


def test_production_refuse_de_demarrer_sans_produits_pro_et_business():
    with pytest.raises(ValidationError) as exc:
        _prod(STRIPE_SECRET_KEY="sk_live_invente")
    message = str(exc.value)
    assert "STRIPE_PRODUCT_PRO" in message
    assert "STRIPE_PRODUCT_BUSINESS" in message


def test_production_refuse_les_produits_du_mode_test_avec_une_cle_reelle():
    with pytest.raises(ValidationError, match="STRIPE_PRODUCT_PRO"):
        _prod(
            STRIPE_SECRET_KEY="sk_live_invente",
            STRIPE_PRODUCT_PRO=PRODUITS_STRIPE_MODE_TEST["pro"],
            STRIPE_PRODUCT_BUSINESS="prod_business_invente",
        )


def test_production_demarre_avec_ses_produits():
    s = _prod(
        STRIPE_SECRET_KEY="sk_live_invente",
        STRIPE_PRODUCT_PRO="prod_pro_invente",
        STRIPE_PRODUCT_BUSINESS="prod_business_invente",
    )
    assert s.DEBUG is False


def test_production_avec_cle_de_test_demarre_sans_variable():
    """Répétition du serveur en mode test (DEBUG=false, clé sk_test_) : pas de refus."""
    s = _prod(STRIPE_SECRET_KEY="sk_test_invente")
    assert s.STRIPE_PRODUCT_PRO == ""
