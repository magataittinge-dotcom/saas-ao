from pydantic_settings import BaseSettings
from functools import lru_cache


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

    # CORS
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Re-exports — keep the public surface stable for callers that already
# do `from config import get_settings` (12 sites at the time of writing).
from .locale import LocaleConfig, get_locale_config  # noqa: E402,F401

__all__ = ["Settings", "get_settings", "LocaleConfig", "get_locale_config"]
