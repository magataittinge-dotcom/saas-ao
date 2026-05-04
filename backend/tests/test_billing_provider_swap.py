"""Smoke test for swapping the billing provider via env var.

The factory caches its instance per-process. To test a swap we use
:func:`reset_billing_provider`, which is documented in factory.py as
test-only.

This file *also* registers a fake provider in the factory module to
validate that the registration pattern works (the README of the
abstraction tells future devs how to add a Lemonsqueezy / Paddle / etc.
provider — this test makes sure that pattern actually does what it says
on the tin).
"""
from typing import Any

import pytest

from services.billing import (
    BillingProvider,
    get_billing_provider,
    reset_billing_provider,
)
from services.billing import factory as billing_factory
from services.billing.stripe_provider import StripeProvider


class _FakeProvider(BillingProvider):
    """Minimal provider used only for swap tests."""

    name = "fake"

    def create_customer(self, email, name=None, metadata=None):
        return "cus_fake"

    def get_customer(self, customer_id):
        return {"id": customer_id, "provider": "fake"}

    def update_customer(self, customer_id, updates):
        return {"id": customer_id, **updates}

    def create_subscription(self, customer_id, price_id, metadata=None):
        return {"id": "sub_fake", "status": "active"}

    def cancel_subscription(self, subscription_id, at_period_end=True):
        return None

    def list_subscriptions(self, customer_id):
        return []

    def update_payment_method(self, customer_id, payment_method_id):
        return None

    def get_invoice(self, invoice_id):
        return {"id": invoice_id}

    def list_invoices(self, customer_id, limit=10):
        return []

    def create_checkout_session(
        self, customer_id, price_id, success_url, cancel_url,
        metadata=None, client_reference_id=None,
    ):
        return "https://fake.test/checkout"

    def create_portal_session(self, customer_id, return_url):
        return "https://fake.test/portal"

    def verify_webhook(self, payload, signature) -> dict[str, Any]:
        return {"type": "fake.event", "data": {"object": {}}}


@pytest.fixture
def register_fake_provider():
    """Patch the factory to recognise BILLING_PROVIDER=fake."""
    original_build = billing_factory._build

    def patched_build(name: str):
        if name == "fake":
            return _FakeProvider()
        return original_build(name)

    billing_factory._build = patched_build  # type: ignore[assignment]
    try:
        yield
    finally:
        billing_factory._build = original_build  # type: ignore[assignment]


@pytest.fixture(autouse=True)
def _isolate_singleton():
    reset_billing_provider()
    yield
    reset_billing_provider()


def test_swap_provider_via_env(monkeypatch, register_fake_provider):
    """Changing BILLING_PROVIDER and calling reset returns a different class."""
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_swap")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_swap")
    from config import get_settings
    get_settings.cache_clear()

    monkeypatch.setenv("BILLING_PROVIDER", "stripe")
    assert isinstance(get_billing_provider(), StripeProvider)

    reset_billing_provider()
    monkeypatch.setenv("BILLING_PROVIDER", "fake")
    assert isinstance(get_billing_provider(), _FakeProvider)


def test_swap_provider_factory_picks_up_env_change(monkeypatch, register_fake_provider):
    """Without an explicit reset, switching env vars between calls still
    returns the new provider because the factory checks the env name on
    every call (the cache key is the provider name)."""
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_swap2")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_swap2")
    from config import get_settings
    get_settings.cache_clear()

    monkeypatch.setenv("BILLING_PROVIDER", "fake")
    a = get_billing_provider()
    assert isinstance(a, _FakeProvider)

    monkeypatch.setenv("BILLING_PROVIDER", "stripe")
    b = get_billing_provider()
    assert isinstance(b, StripeProvider)
    assert a is not b
