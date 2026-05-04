"""Tests for the locale config module."""
import pytest

from config.locale import LocaleConfig, get_locale_config


def test_default_locale_is_france(monkeypatch):
    """Without overrides, defaults must target the French market."""
    # Strip any locale env vars set by the dev shell so we test the defaults.
    for key in (
        "COUNTRY_CODE", "CURRENCY", "CURRENCY_SYMBOL", "TAX_RATE", "TAX_LABEL",
        "TIMEZONE", "LOCALE", "DATE_FORMAT", "COMPANY_NAME", "COMPANY_ADDRESS",
        "COMPANY_VAT_NUMBER", "COMPANY_REGISTRATION_NUMBER", "LEGAL_JURISDICTION",
    ):
        monkeypatch.delenv(key, raising=False)

    cfg = get_locale_config()

    assert isinstance(cfg, LocaleConfig)
    assert cfg.country_code == "FR"
    assert cfg.currency == "EUR"
    assert cfg.currency_symbol == "€"
    assert cfg.tax_rate == 0.20
    assert cfg.tax_label == "TVA"
    assert cfg.timezone == "Europe/Paris"
    assert cfg.locale == "fr_FR"
    assert cfg.date_format == "%d/%m/%Y"
    assert cfg.legal_jurisdiction == "FR"


def test_locale_overrides_via_env(monkeypatch):
    """Setting env vars must produce a UAE-shaped config."""
    monkeypatch.setenv("COUNTRY_CODE", "AE")
    monkeypatch.setenv("CURRENCY", "AED")
    monkeypatch.setenv("TAX_RATE", "0.05")
    monkeypatch.setenv("TAX_LABEL", "VAT")
    monkeypatch.setenv("TIMEZONE", "Asia/Dubai")
    monkeypatch.setenv("LOCALE", "ar_AE")
    monkeypatch.setenv("LEGAL_JURISDICTION", "AE")
    monkeypatch.setenv("COMPANY_NAME", "Synorix LLC")

    cfg = get_locale_config()

    assert cfg.country_code == "AE"
    assert cfg.currency == "AED"
    assert cfg.tax_rate == 0.05
    assert cfg.tax_label == "VAT"
    assert cfg.timezone == "Asia/Dubai"
    assert cfg.locale == "ar_AE"
    assert cfg.legal_jurisdiction == "AE"
    assert cfg.company_name == "Synorix LLC"


def test_locale_config_is_immutable():
    cfg = get_locale_config()
    with pytest.raises(Exception):
        # frozen dataclass — assignment must fail
        cfg.country_code = "XX"  # type: ignore[misc]


def test_invalid_tax_rate_raises(monkeypatch):
    monkeypatch.setenv("TAX_RATE", "not-a-number")
    with pytest.raises(ValueError, match="Invalid TAX_RATE"):
        get_locale_config()


def test_locale_as_dict_contains_every_field():
    cfg = get_locale_config()
    d = cfg.as_dict()
    expected = {
        "country_code", "currency", "currency_symbol", "tax_rate",
        "tax_label", "timezone", "locale", "date_format",
        "company_name", "company_address", "company_vat_number",
        "company_registration_number", "legal_jurisdiction",
    }
    assert set(d.keys()) == expected
