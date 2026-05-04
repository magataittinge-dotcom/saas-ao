"""Provider factory — picks the concrete :class:`BillingProvider` to use.

The factory caches the instance per-process so the rest of the codebase
just calls :func:`get_billing_provider` without worrying about lifecycle.

Tests can swap providers between cases with :func:`reset_billing_provider`
(documented and used only for tests).
"""
from __future__ import annotations

import os
import threading

from config import get_settings

from .base import BillingProvider
from .stripe_provider import StripeProvider

_lock = threading.Lock()
_instance: BillingProvider | None = None
_instance_provider_name: str | None = None


def get_billing_provider() -> BillingProvider:
    """Return the singleton billing provider instance for this process.

    Provider is selected by ``BILLING_PROVIDER`` env var (default: ``stripe``).
    Unknown values raise ``ValueError`` with a helpful message.
    """
    global _instance, _instance_provider_name
    name = os.getenv("BILLING_PROVIDER", "stripe").lower().strip()

    with _lock:
        if _instance is not None and _instance_provider_name == name:
            return _instance
        _instance = _build(name)
        _instance_provider_name = name
        return _instance


def reset_billing_provider() -> None:
    """Clear the cached singleton — TESTS ONLY.

    Used by tests that change ``BILLING_PROVIDER`` between cases. Calling
    this in production code would force a fresh provider on the next call,
    which is harmless but wasteful (re-validates the API key, etc.).
    """
    global _instance, _instance_provider_name
    with _lock:
        _instance = None
        _instance_provider_name = None


def _build(name: str) -> BillingProvider:
    if name == "stripe":
        s = get_settings()
        return StripeProvider(
            api_key=s.STRIPE_SECRET_KEY,
            webhook_secret=s.STRIPE_WEBHOOK_SECRET,
        )

    raise ValueError(
        f"Unknown billing provider: {name!r}. "
        f"Supported: 'stripe'. To add a new one, implement BillingProvider "
        f"in services/billing/<name>_provider.py and register it here."
    )
