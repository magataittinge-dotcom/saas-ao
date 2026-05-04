"""Abstract billing provider interface.

Synorix calls this interface from the routers; concrete implementations
(Stripe today, Lemonsqueezy / Paddle / Stripe-UAE tomorrow) live in
sibling modules. The factory in :mod:`services.billing.factory` picks
the concrete class via the ``BILLING_PROVIDER`` env var.

Design notes:

* Methods return primitives (``str`` / ``dict``) rather than
  provider-specific SDK types, so swapping a provider doesn't ripple
  into the routers.
* ``verify_webhook`` is intentionally synchronous & must enforce
  signature checking — it's the security perimeter for billing events.
* Errors translate to ``BillingError`` so the routers can render a
  consistent message regardless of the underlying SDK quirks.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BillingError(Exception):
    """Generic, provider-agnostic billing failure."""


class BillingProvider(ABC):
    """Common interface that every billing provider implements."""

    # ── Customers ────────────────────────────────────────────────────────────
    @abstractmethod
    def create_customer(
        self,
        email: str,
        name: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Return the provider's customer id (e.g. Stripe ``cus_…``)."""

    @abstractmethod
    def get_customer(self, customer_id: str) -> dict[str, Any]:
        """Return the customer object as a dict."""

    @abstractmethod
    def update_customer(
        self, customer_id: str, updates: dict[str, Any]
    ) -> dict[str, Any]:
        """Apply ``updates`` and return the new customer state."""

    # ── Subscriptions ────────────────────────────────────────────────────────
    @abstractmethod
    def create_subscription(
        self,
        customer_id: str,
        price_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Create a recurring subscription on an existing customer."""

    @abstractmethod
    def cancel_subscription(
        self, subscription_id: str, at_period_end: bool = True
    ) -> None:
        """Cancel a subscription. Default keeps the user covered until the
        end of the paid period (matches Stripe's ``cancel_at_period_end``)."""

    @abstractmethod
    def list_subscriptions(self, customer_id: str) -> list[dict[str, Any]]:
        """Return all subscriptions for a customer."""

    # ── Payment methods ──────────────────────────────────────────────────────
    @abstractmethod
    def update_payment_method(
        self, customer_id: str, payment_method_id: str
    ) -> None:
        """Attach the payment method and set it as the default."""

    # ── Invoices ─────────────────────────────────────────────────────────────
    @abstractmethod
    def get_invoice(self, invoice_id: str) -> dict[str, Any]:
        """Return invoice as a dict."""

    @abstractmethod
    def list_invoices(
        self, customer_id: str, limit: int = 10
    ) -> list[dict[str, Any]]:
        """Return the most recent invoices."""

    # ── Hosted UIs (Checkout + Customer portal) ──────────────────────────────
    @abstractmethod
    def create_checkout_session(
        self,
        customer_id: str,
        price_id: str,
        success_url: str,
        cancel_url: str,
        metadata: dict[str, Any] | None = None,
        client_reference_id: str | None = None,
    ) -> str:
        """Return the URL the user should be redirected to."""

    @abstractmethod
    def create_portal_session(self, customer_id: str, return_url: str) -> str:
        """Return the customer-portal URL (subscription / invoices / payment
        methods management)."""

    # ── Webhooks ─────────────────────────────────────────────────────────────
    @abstractmethod
    def verify_webhook(self, payload: bytes, signature: str) -> dict[str, Any]:
        """Verify the webhook signature and return the parsed event.

        Implementations MUST raise :class:`BillingError` (or a subclass) on
        signature mismatch — never silently accept events.
        """

    # ── Optional helpers for product / price lookups ─────────────────────────
    def get_default_price_for_product(self, product_id: str) -> str:
        """Default implementation raises — providers that support it override."""
        raise NotImplementedError(
            "This provider does not implement default-price lookup."
        )

    def retrieve_session(self, session_id: str) -> dict[str, Any]:
        """Default implementation raises — providers that support it override."""
        raise NotImplementedError(
            "This provider does not implement session retrieval."
        )

    def retrieve_subscription(self, subscription_id: str) -> dict[str, Any]:
        """Default implementation raises — providers that support it override."""
        raise NotImplementedError(
            "This provider does not implement subscription retrieval."
        )
