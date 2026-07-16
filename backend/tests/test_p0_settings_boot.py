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
