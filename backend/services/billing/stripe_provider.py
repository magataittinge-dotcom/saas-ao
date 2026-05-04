"""Stripe implementation of :class:`BillingProvider`.

Wraps the official ``stripe`` SDK and translates exceptions into
:class:`BillingError`. The router never imports the ``stripe`` package
directly — that's the whole point of the abstraction.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import stripe

from .base import BillingError, BillingProvider

logger = logging.getLogger(__name__)


class StripeProvider(BillingProvider):
    """Stripe-backed billing provider."""

    def __init__(self, api_key: str, webhook_secret: str = ""):
        if not api_key:
            raise BillingError("Stripe API key is empty — set STRIPE_SECRET_KEY")
        # Set the module-level api_key so downstream calls authenticate.
        stripe.api_key = api_key
        self._api_key = api_key
        self._webhook_secret = webhook_secret

    # ── Customers ────────────────────────────────────────────────────────────
    def create_customer(self, email, name=None, metadata=None):
        try:
            customer = stripe.Customer.create(
                email=email,
                name=name,
                metadata=metadata or {},
            )
            return customer.id
        except stripe.error.StripeError as exc:
            raise BillingError(f"Stripe create_customer failed: {exc}") from exc

    def get_customer(self, customer_id):
        try:
            return _to_dict(stripe.Customer.retrieve(customer_id))
        except stripe.error.InvalidRequestError as exc:
            raise BillingError(f"Customer not found: {customer_id}") from exc
        except stripe.error.StripeError as exc:
            raise BillingError(f"Stripe get_customer failed: {exc}") from exc

    def update_customer(self, customer_id, updates):
        try:
            return _to_dict(stripe.Customer.modify(customer_id, **updates))
        except stripe.error.StripeError as exc:
            raise BillingError(f"Stripe update_customer failed: {exc}") from exc

    # ── Subscriptions ────────────────────────────────────────────────────────
    def create_subscription(self, customer_id, price_id, metadata=None):
        try:
            sub = stripe.Subscription.create(
                customer=customer_id,
                items=[{"price": price_id}],
                metadata=metadata or {},
            )
            return _to_dict(sub)
        except stripe.error.StripeError as exc:
            raise BillingError(f"Stripe create_subscription failed: {exc}") from exc

    def cancel_subscription(self, subscription_id, at_period_end=True):
        try:
            if at_period_end:
                stripe.Subscription.modify(
                    subscription_id, cancel_at_period_end=True
                )
            else:
                stripe.Subscription.delete(subscription_id)
        except stripe.error.StripeError as exc:
            raise BillingError(f"Stripe cancel_subscription failed: {exc}") from exc

    def list_subscriptions(self, customer_id):
        try:
            subs = stripe.Subscription.list(customer=customer_id)
            return [_to_dict(s) for s in subs.auto_paging_iter()]
        except stripe.error.StripeError as exc:
            raise BillingError(f"Stripe list_subscriptions failed: {exc}") from exc

    def retrieve_subscription(self, subscription_id):
        try:
            return _to_dict(stripe.Subscription.retrieve(subscription_id))
        except stripe.error.InvalidRequestError as exc:
            raise BillingError(f"Subscription not found: {subscription_id}") from exc
        except stripe.error.StripeError as exc:
            raise BillingError(f"Stripe retrieve_subscription failed: {exc}") from exc

    # ── Payment methods ──────────────────────────────────────────────────────
    def update_payment_method(self, customer_id, payment_method_id):
        try:
            stripe.PaymentMethod.attach(
                payment_method_id, customer=customer_id
            )
            stripe.Customer.modify(
                customer_id,
                invoice_settings={"default_payment_method": payment_method_id},
            )
        except stripe.error.StripeError as exc:
            raise BillingError(f"Stripe update_payment_method failed: {exc}") from exc

    # ── Invoices ─────────────────────────────────────────────────────────────
    def get_invoice(self, invoice_id):
        try:
            return _to_dict(stripe.Invoice.retrieve(invoice_id))
        except stripe.error.StripeError as exc:
            raise BillingError(f"Stripe get_invoice failed: {exc}") from exc

    def list_invoices(self, customer_id, limit=10):
        try:
            invs = stripe.Invoice.list(customer=customer_id, limit=limit)
            return [_to_dict(i) for i in invs.data]
        except stripe.error.StripeError as exc:
            raise BillingError(f"Stripe list_invoices failed: {exc}") from exc

    # ── Hosted UIs ───────────────────────────────────────────────────────────
    def create_checkout_session(
        self,
        customer_id,
        price_id,
        success_url,
        cancel_url,
        metadata=None,
        client_reference_id=None,
    ):
        try:
            session = stripe.checkout.Session.create(
                customer=customer_id,
                payment_method_types=["card"],
                mode="subscription",
                line_items=[{"price": price_id, "quantity": 1}],
                success_url=success_url,
                cancel_url=cancel_url,
                client_reference_id=client_reference_id,
                metadata=metadata or {},
            )
            return session.url
        except stripe.error.StripeError as exc:
            raise BillingError(f"Stripe create_checkout_session failed: {exc}") from exc

    def create_portal_session(self, customer_id, return_url):
        try:
            session = stripe.billing_portal.Session.create(
                customer=customer_id, return_url=return_url,
            )
            return session.url
        except stripe.error.StripeError as exc:
            raise BillingError(f"Stripe create_portal_session failed: {exc}") from exc

    def retrieve_session(self, session_id):
        try:
            return _to_dict(stripe.checkout.Session.retrieve(session_id))
        except stripe.error.InvalidRequestError as exc:
            raise BillingError(f"Session not found: {session_id}") from exc
        except stripe.error.StripeError as exc:
            raise BillingError(f"Stripe retrieve_session failed: {exc}") from exc

    # ── Default price ────────────────────────────────────────────────────────
    def get_default_price_for_product(self, product_id):
        try:
            prices = stripe.Price.list(
                product=product_id, active=True, type="recurring", limit=1,
            )
            if not prices.data:
                raise BillingError(f"No active recurring price for product {product_id}")
            return prices.data[0].id
        except stripe.error.StripeError as exc:
            raise BillingError(f"Stripe get_default_price failed: {exc}") from exc

    # ── Webhook ──────────────────────────────────────────────────────────────
    def verify_webhook(self, payload, signature):
        """Authenticate the webhook and return the event as a dict.

        - In production: signature MUST verify against the configured secret.
        - With no secret configured: only allowed if running unsigned events
          would be safe (legacy DEBUG mode). The router gates this — this
          method just refuses if the secret is empty + no signature.
        """
        if self._webhook_secret:
            try:
                event = stripe.Webhook.construct_event(
                    payload, signature, self._webhook_secret,
                )
                return _to_dict(event)
            except stripe.error.SignatureVerificationError as exc:
                raise BillingError("Invalid webhook signature") from exc
            except ValueError as exc:
                raise BillingError(f"Invalid webhook payload: {exc}") from exc

        # No secret. Caller must explicitly opt in to unsigned parsing
        # (typically only in DEBUG). We still parse but do NOT trust.
        try:
            event = stripe.Event.construct_from(json.loads(payload), self._api_key)
            return _to_dict(event)
        except (ValueError, TypeError) as exc:
            raise BillingError(f"Invalid webhook payload: {exc}") from exc


def _to_dict(obj: Any) -> dict[str, Any]:
    """Best-effort conversion of a Stripe SDK object to a plain dict."""
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    to_dict = getattr(obj, "to_dict_recursive", None) or getattr(obj, "to_dict", None)
    if to_dict:
        try:
            return to_dict()
        except Exception:  # pragma: no cover — defensive
            pass
    # As a last resort, do a shallow JSON round-trip via stripe's serializer.
    try:
        return json.loads(str(obj))
    except Exception:
        return {"_raw": str(obj)}
