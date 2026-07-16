from pydantic import model_validator
from pydantic_settings import BaseSettings
from functools import lru_cache

# Valeur d'exemple de backend/.env.example — ne doit jamais tourner en prod
# (SECRET_KEY signe les URLs de fichiers : un secret public = URLs forgeables).
_SECRET_KEY_PLACEHOLDER = "your-secret-key-here-generate-with-openssl-rand-hex-32"


class Settings(BaseSettings):
    # App
    APP_NAME: str = "SaaS AO BTP"
    DEBUG: bool = False
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Database
    DATABASE_URL: str

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"

    # Anthropic (Claude API)
    ANTHROPIC_API_KEY: str

    # Voyage AI (embeddings RAG — Phase 1). Optionnel tant que le RAG n'est
    # pas activé ; requis dès l'indexation/recherche vectorielle.
    VOYAGE_API_KEY: str = ""
    # Lot 7 T3 — enrichissement réglementaire de la génération mémoire
    # (retrieve top-3 injecté au prompt). Défaut FALSE : chemin inchangé.
    RAG_ENRICHMENT: bool = False

    # AWS S3
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_S3_BUCKET: str = ""
    AWS_REGION: str = "eu-west-3"

    # Clerk
    CLERK_SECRET_KEY: str = ""
    CLERK_JWKS_URL: str = ""

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # Google Maps Static API
    GOOGLE_MAPS_API_KEY: str = ""

    # SMTP (C23 — notifications email). Absents → in-app seul, jamais de crash.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""

    # Ops — jeton d'accès à /api/metrics (agrégats plateforme, jamais public).
    # Vide + prod → endpoint fermé (404). Vide + DEBUG → toléré (S3.5).
    METRICS_TOKEN: str = ""

    # CORS
    FRONTEND_URL: str = "http://localhost:3000"

    @model_validator(mode="after")
    def _fail_fast_prod_config(self) -> "Settings":
        """O1 (audit prod) — en production (DEBUG=False), les variables dont
        l'oubli casse l'app SILENCIEUSEMENT au premier usage doivent faire
        échouer le BOOT, avec la liste complète de ce qui manque."""
        if self.DEBUG:
            return self
        problems: list[str] = []
        if self.SECRET_KEY == _SECRET_KEY_PLACEHOLDER or len(self.SECRET_KEY) < 32:
            problems.append(
                "SECRET_KEY : valeur d'exemple ou trop courte — générer avec `openssl rand -hex 32`"
            )
        if not self.CLERK_JWKS_URL:
            problems.append(
                "CLERK_JWKS_URL manquante — toute authentification échouerait (500) à la première requête"
            )
        if not self.CLERK_SECRET_KEY:
            problems.append(
                "CLERK_SECRET_KEY manquante — le sync utilisateur échouerait (502)"
            )
        if not self.STRIPE_WEBHOOK_SECRET:
            problems.append(
                "STRIPE_WEBHOOK_SECRET manquant — les paiements ne seraient jamais appliqués (webhook 500)"
            )
        if "localhost" in self.FRONTEND_URL or "127.0.0.1" in self.FRONTEND_URL:
            problems.append(
                "FRONTEND_URL pointe sur localhost — CORS bloquerait le domaine réel et les redirections Stripe seraient cassées"
            )
        if problems:
            raise ValueError(
                "Configuration de production invalide (DEBUG=false) :\n- "
                + "\n- ".join(problems)
            )
        return self

    class Config:
        env_file = ".env"
        case_sensitive = True
        # R1 (audit prod) : une clé de .env sans champ déclaré (SENTRY_DSN,
        # TELEGRAM_*, …) ne doit JAMAIS empêcher le boot — le défaut
        # pydantic-settings v2 est extra='forbid' (ValidationError).
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Re-exports — keep the public surface stable for callers that already
# do `from config import get_settings` (12 sites at the time of writing).
from .locale import LocaleConfig, get_locale_config  # noqa: E402,F401

__all__ = ["Settings", "get_settings", "LocaleConfig", "get_locale_config"]
