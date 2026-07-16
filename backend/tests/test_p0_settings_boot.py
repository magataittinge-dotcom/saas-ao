"""Phase 0 (rapport production-ready) — R1 : le boot ne doit jamais échouer
à cause d'une clé inconnue dans le .env.

pydantic-settings v2 est en `extra='forbid'` par défaut : une ligne de .env
sans champ `Settings` correspondant (ex. SENTRY_DSN, documentée dans
DEPLOYMENT.md §6 avant d'être câblée) levait `ValidationError: extra_forbidden`
et empêchait l'API de démarrer en production.
"""
from pathlib import Path

from config import Settings


def _write_env(tmp_path: Path, extra_lines: str = "") -> Path:
    env = tmp_path / ".env"
    env.write_text(
        "SECRET_KEY=test-secret\n"
        "DATABASE_URL=sqlite:///ignore.db\n"
        "ANTHROPIC_API_KEY=sk-ant-test\n"
        "DEBUG=true\n" + extra_lines,
        encoding="utf-8",
    )
    return env


def test_unknown_env_key_does_not_prevent_boot(tmp_path):
    """La ligne SENTRY_DSN du .env documenté ne doit pas faire crasher le boot."""
    env = _write_env(tmp_path, "SENTRY_DSN=https://exemple@sentry.io/1\n")
    s = Settings(_env_file=str(env))
    assert s.DEBUG is True


def test_multiple_unknown_keys_ignored(tmp_path):
    """Toute future clé opérationnelle non déclarée (Telegram, etc.) est tolérée."""
    env = _write_env(tmp_path, "TELEGRAM_BOT_TOKEN=123:abc\nFUTURE_FLAG=on\n")
    s = Settings(_env_file=str(env))
    assert s.ANTHROPIC_API_KEY  # les champs déclarés restent bien chargés


# ─── O1 — fail-fast de la configuration de production ────────────────────────
# Les variables dont l'oubli casse l'app SILENCIEUSEMENT au premier usage
# (auth Clerk → 500, webhook Stripe → paiements jamais appliqués, FRONTEND_URL
# localhost → CORS/redirections cassées, SECRET_KEY d'exemple → URLs signées
# forgeables) doivent faire échouer LE BOOT quand DEBUG=False.

import pytest  # noqa: E402
from pydantic import ValidationError  # noqa: E402

_PLACEHOLDER = "your-secret-key-here-generate-with-openssl-rand-hex-32"


def _prod_kwargs(**over):
    """Settings de prod valides ; _env_file=None isole des .env locaux."""
    base = dict(
        _env_file=None,
        DEBUG=False,
        SECRET_KEY="a" * 64,
        DATABASE_URL="postgresql://synorix:pwd@localhost:5432/synorix",
        ANTHROPIC_API_KEY="sk-ant-prod",
        CLERK_JWKS_URL="https://clerk.synorix.fr/.well-known/jwks.json",
        CLERK_SECRET_KEY="sk_live_x",
        STRIPE_WEBHOOK_SECRET="whsec_x",
        FRONTEND_URL="https://synorix.fr",
    )
    base.update(over)
    return base


def test_prod_config_complete_boots():
    s = Settings(**_prod_kwargs())
    assert s.DEBUG is False


def test_prod_rejects_placeholder_secret_key():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(**_prod_kwargs(SECRET_KEY=_PLACEHOLDER))


def test_prod_rejects_short_secret_key():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(**_prod_kwargs(SECRET_KEY="court"))


def test_prod_rejects_empty_clerk_jwks():
    with pytest.raises(ValidationError, match="CLERK_JWKS_URL"):
        Settings(**_prod_kwargs(CLERK_JWKS_URL=""))


def test_prod_rejects_empty_clerk_secret():
    with pytest.raises(ValidationError, match="CLERK_SECRET_KEY"):
        Settings(**_prod_kwargs(CLERK_SECRET_KEY=""))


def test_prod_rejects_empty_stripe_webhook_secret():
    with pytest.raises(ValidationError, match="STRIPE_WEBHOOK_SECRET"):
        Settings(**_prod_kwargs(STRIPE_WEBHOOK_SECRET=""))


def test_prod_rejects_localhost_frontend_url():
    with pytest.raises(ValidationError, match="FRONTEND_URL"):
        Settings(**_prod_kwargs(FRONTEND_URL="http://localhost:3000"))


def test_prod_reports_all_problems_at_once():
    """L'opérateur doit voir TOUTES les variables à corriger, pas une par une."""
    with pytest.raises(ValidationError) as exc:
        Settings(**_prod_kwargs(
            CLERK_JWKS_URL="",
            STRIPE_WEBHOOK_SECRET="",
            FRONTEND_URL="http://127.0.0.1:3000",
        ))
    msg = str(exc.value)
    for name in ("CLERK_JWKS_URL", "STRIPE_WEBHOOK_SECRET", "FRONTEND_URL"):
        assert name in msg


def test_debug_tolerates_empty_config():
    """En dev (DEBUG=true), les défauts vides restent tolérés — rien ne change."""
    s = Settings(**_prod_kwargs(
        DEBUG=True,
        SECRET_KEY="test-secret-key",
        CLERK_JWKS_URL="",
        CLERK_SECRET_KEY="",
        STRIPE_WEBHOOK_SECRET="",
        FRONTEND_URL="http://localhost:3000",
    ))
    assert s.DEBUG is True
