"""Pluggable billing layer.

Routes import :func:`get_billing_provider` from this package and call the
:class:`BillingProvider` interface. The concrete implementation is picked
from the ``BILLING_PROVIDER`` env var (default: stripe).

See ``backend/docs/MIGRATION_PROVIDER.md`` for migration procedures.
"""
from .base import BillingError, BillingProvider
from .factory import get_billing_provider, reset_billing_provider

__all__ = [
    "BillingError",
    "BillingProvider",
    "get_billing_provider",
    "reset_billing_provider",
]
