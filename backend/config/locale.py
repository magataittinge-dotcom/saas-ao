"""Geographic / locale configuration — externalised to env vars.

This module centralises every value that depends on the country / market
Synorix is currently operating in. The defaults target France today; in
2027 we'll switch to the UAE config by changing env vars only — no code
edits.

Read by:
  - billing factory (currency code on Stripe customer creation)
  - email templates (legal mention footer)
  - PDF/DOCX exports (date format, locale)
  - any future I18n layer

Pattern: stateless module-level helper. Tests can override via env vars
or via :func:`set_locale_for_test`.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class LocaleConfig:
    """Immutable snapshot of the locale config at call time."""

    country_code: str
    currency: str
    currency_symbol: str
    tax_rate: float
    tax_label: str
    timezone: str
    locale: str
    date_format: str
    company_name: str
    company_address: str
    company_vat_number: str
    company_registration_number: str
    legal_jurisdiction: str

    def as_dict(self) -> dict:
        return asdict(self)


def _parse_tax_rate(raw: str) -> float:
    """Parse a tax rate string, raising a clear error if invalid."""
    try:
        return float(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"Invalid TAX_RATE value: {raw!r} — expected a float like '0.20'"
        ) from exc


def get_locale_config() -> LocaleConfig:
    """Build the locale config from env vars (with France defaults).

    Always reads env at call time, so tests that monkeypatch os.environ
    pick up the new values without restarting the process.
    """
    return LocaleConfig(
        country_code=os.getenv("COUNTRY_CODE", "FR"),
        currency=os.getenv("CURRENCY", "EUR"),
        currency_symbol=os.getenv("CURRENCY_SYMBOL", "€"),
        tax_rate=_parse_tax_rate(os.getenv("TAX_RATE", "0.20")),
        tax_label=os.getenv("TAX_LABEL", "TVA"),
        timezone=os.getenv("TIMEZONE", "Europe/Paris"),
        locale=os.getenv("LOCALE", "fr_FR"),
        date_format=os.getenv("DATE_FORMAT", "%d/%m/%Y"),
        company_name=os.getenv("COMPANY_NAME", "Synorix"),
        company_address=os.getenv("COMPANY_ADDRESS", ""),
        company_vat_number=os.getenv("COMPANY_VAT_NUMBER", ""),
        company_registration_number=os.getenv("COMPANY_REGISTRATION_NUMBER", ""),
        legal_jurisdiction=os.getenv("LEGAL_JURISDICTION", "FR"),
    )
