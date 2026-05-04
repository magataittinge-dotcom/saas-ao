"""Tests for the billing provider abstraction.

Stripe SDK calls are mocked — no network traffic.
"""
from unittest.mock import MagicMock, patch

import pytest

from services.billing import (
    BillingError,
    BillingProvider,
    get_billing_provider,
    reset_billing_provider,
)
from services.billing.factory import _build
from services.billing.stripe_provider import StripeProvider


@pytest.fixture(autouse=True)
def _isolate_singleton():
    """Reset the cached provider before and after every test in this file."""
    reset_billing_provider()
    yield
    reset_billing_provider()


# ── Factory ──────────────────────────────────────────────────────────────────

def test_get_billing_provider_returns_stripe_by_default(monkeypatch):
    monkeypatch.delenv("BILLING_PROVIDER", raising=False)
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_123")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_xyz")
    # `get_settings` is cached — clear it.
    from config import get_settings
    get_settings.cache_clear()

    provider = get_billing_provider()
    assert isinstance(provider, StripeProvider)


def test_get_billing_provider_unknown_raises(monkeypatch):
    monkeypatch.setenv("BILLING_PROVIDER", "lemonsqueezy")
    with pytest.raises(ValueError, match="Unknown billing provider"):
        get_billing_provider()


def test_get_billing_provider_singleton(monkeypatch):
    monkeypatch.setenv("BILLING_PROVIDER", "stripe")
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_singleton")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_singleton")
    from config import get_settings
    get_settings.cache_clear()

    a = get_billing_provider()
    b = get_billing_provider()
    assert a is b, "Factory must return the same instance within a process"


def test_factory_rejects_empty_stripe_key(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "")
    from config import get_settings
    get_settings.cache_clear()

    with pytest.raises(BillingError):
        _build("stripe")


# ── BillingProvider interface contract ───────────────────────────────────────

def test_stripe_provider_inherits_billing_provider():
    assert issubclass(StripeProvider, BillingProvider)


# ── StripeProvider behaviour with mocked SDK ────────────────────────────────

def _provider() -> StripeProvider:
    return StripeProvider(api_key="sk_test_mock", webhook_secret="whsec_mock")


@patch("services.billing.stripe_provider.stripe.Customer")
def test_stripe_provider_create_customer(MockCustomer):
    fake = MagicMock()
    fake.id = "cus_42"
    MockCustomer.create.return_value = fake

    provider = _provider()
    customer_id = provider.create_customer(
        email="alice@example.com", name="Alice", metadata={"org": "abc"}
    )

    assert customer_id == "cus_42"
    MockCustomer.create.assert_called_once()
    call = MockCustomer.create.call_args.kwargs
    assert call["email"] == "alice@example.com"
    assert call["name"] == "Alice"
    assert call["metadata"] == {"org": "abc"}


@patch("services.billing.stripe_provider.stripe.Subscription")
def test_stripe_provider_create_subscription(MockSubscription):
    fake = MagicMock()
    fake.to_dict_recursive.return_value = {"id": "sub_1", "status": "active"}
    MockSubscription.create.return_value = fake

    provider = _provider()
    sub = provider.create_subscription(
        customer_id="cus_1", price_id="price_1", metadata={"plan": "pro"}
    )

    assert sub == {"id": "sub_1", "status": "active"}
    call = MockSubscription.create.call_args.kwargs
    assert call["customer"] == "cus_1"
    assert call["items"] == [{"price": "price_1"}]


@patch("services.billing.stripe_provider.stripe.Subscription")
def test_stripe_provider_cancel_subscription_at_period_end(MockSubscription):
    provider = _provider()
    provider.cancel_subscription("sub_1", at_period_end=True)
    MockSubscription.modify.assert_called_once_with("sub_1", cancel_at_period_end=True)
    MockSubscription.delete.assert_not_called()


@patch("services.billing.stripe_provider.stripe.Subscription")
def test_stripe_provider_cancel_subscription_immediate(MockSubscription):
    provider = _provider()
    provider.cancel_subscription("sub_1", at_period_end=False)
    MockSubscription.delete.assert_called_once_with("sub_1")
    MockSubscription.modify.assert_not_called()


@patch("services.billing.stripe_provider.stripe.checkout")
def test_stripe_provider_create_checkout_session_returns_url(MockCheckout):
    fake = MagicMock()
    fake.url = "https://checkout.stripe.com/pay/abc"
    MockCheckout.Session.create.return_value = fake

    provider = _provider()
    url = provider.create_checkout_session(
        customer_id="cus_1",
        price_id="price_1",
        success_url="https://app.test/ok",
        cancel_url="https://app.test/ko",
        metadata={"plan": "pro"},
        client_reference_id="org_1",
    )
    assert url == "https://checkout.stripe.com/pay/abc"
    call = MockCheckout.Session.create.call_args.kwargs
    assert call["mode"] == "subscription"
    assert call["client_reference_id"] == "org_1"


@patch("services.billing.stripe_provider.stripe.billing_portal")
def test_stripe_provider_create_portal_session(MockPortal):
    fake = MagicMock()
    fake.url = "https://billing.stripe.com/p/abc"
    MockPortal.Session.create.return_value = fake

    provider = _provider()
    url = provider.create_portal_session("cus_1", "https://app.test/billing")
    assert url == "https://billing.stripe.com/p/abc"


@patch("services.billing.stripe_provider.stripe.Webhook")
def test_stripe_provider_verify_webhook_valid_signature(MockWebhook):
    raw_event = MagicMock()
    raw_event.to_dict_recursive.return_value = {
        "type": "checkout.session.completed",
        "data": {"object": {}},
    }
    MockWebhook.construct_event.return_value = raw_event

    provider = _provider()
    event = provider.verify_webhook(b"{}", "t=1,sig=abc")

    assert event == {
        "type": "checkout.session.completed",
        "data": {"object": {}},
    }
    MockWebhook.construct_event.assert_called_once_with(
        b"{}", "t=1,sig=abc", "whsec_mock"
    )


@patch("services.billing.stripe_provider.stripe.Webhook")
def test_stripe_provider_verify_webhook_invalid_signature_raises(MockWebhook):
    import stripe
    MockWebhook.construct_event.side_effect = stripe.error.SignatureVerificationError(
        "bad sig", b"sig"
    )

    provider = _provider()
    with pytest.raises(BillingError, match="Invalid webhook signature"):
        provider.verify_webhook(b"{}", "t=1,sig=fake")


@patch("services.billing.stripe_provider.stripe.Customer")
def test_stripe_provider_translates_sdk_errors_to_billing_error(MockCustomer):
    import stripe
    MockCustomer.create.side_effect = stripe.error.APIError("boom")

    provider = _provider()
    with pytest.raises(BillingError, match="create_customer failed"):
        provider.create_customer(email="x@y.z", name="X")


@patch("services.billing.stripe_provider.stripe.Price")
def test_stripe_provider_default_price_for_product(MockPrice):
    item = MagicMock()
    item.id = "price_42"
    MockPrice.list.return_value = MagicMock(data=[item])

    provider = _provider()
    assert provider.get_default_price_for_product("prod_1") == "price_42"


@patch("services.billing.stripe_provider.stripe.Price")
def test_stripe_provider_default_price_when_no_active_price(MockPrice):
    MockPrice.list.return_value = MagicMock(data=[])

    provider = _provider()
    with pytest.raises(BillingError, match="No active recurring price"):
        provider.get_default_price_for_product("prod_1")
