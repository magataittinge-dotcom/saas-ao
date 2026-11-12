from pydantic import model_validator
from pydantic_settings import BaseSettings
from functools import lru_cache

# Valeur d'exemple de backend/.env.example — ne doit jamais tourner en prod
# (SECRET_KEY signe les URLs de fichiers : un secret public = URLs forgeables).
_SECRET_KEY_PLACEHOLDER = "your-secret-key-here-generate-with-openssl-rand-hex-32"

# Produits Stripe du MODE TEST du compte de développement : seul repli quand
# STRIPE_PRODUCT_PRO / STRIPE_PRODUCT_BUSINESS sont vides ET que la clé est de test.
# Ils n'existent pas en mode réel (le paiement y dirait « Tarif indisponible »).
PRODUITS_STRIPE_MODE_TEST = {
    "pro": "prod_UFuTbjsjJG2tlq",
    "business": "prod_UFuVeLpu3fDVQp",
}


def cle_stripe_de_production(cle: str) -> bool:
    """Clé secrète (sk_) ou restreinte (rk_) du mode réel de Stripe."""
    return cle.startswith(("sk_live_", "rk_live_"))


class Settings(BaseSettings):
    # App (APP_NAME, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES retirés : restes de l'authentification d'avant Clerk, plus
    # rien ne les lisait ; posés dans un .env, ils sont ignorés comme toute clé inconnue, voir Config.extra)
    DEBUG: bool = False
    SECRET_KEY: str

    # Database
    DATABASE_URL: str

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"

    # Anthropic (Claude API)
    ANTHROPIC_API_KEY: str
    # B9 — jeu de démonstration de l'analyse DCE (« Commune Test »), pour une
    # démonstration sans clé valable. DÉSACTIVÉ par défaut, indépendant de
    # DEBUG : sans ce drapeau, une clé absente, d'exemple ou révoquée fait
    # échouer l'analyse (unité rendue), jamais de fausse analyse enregistrée.
    # Activer : SYNORIX_ANALYSE_DEMO=1 ; refusé au démarrage hors DEBUG.
    SYNORIX_ANALYSE_DEMO: bool = False

    # Voyage AI (embeddings RAG — Phase 1). Optionnel tant que le RAG n'est
    # pas activé ; requis dès l'indexation/recherche vectorielle.
    VOYAGE_API_KEY: str = ""
    # Lot 7 T3 — enrichissement réglementaire de la génération mémoire
    # (retrieve top-3 injecté au prompt). Défaut FALSE : chemin inchangé.
    RAG_ENRICHMENT: bool = False
    # Modèle unique forcé pour les 4 segments du mémoire (ex. « claude-sonnet-4-6 »
    # pour revenir à l'ancien réglage). Vide : mapping de memoire_generator, soit
    # Sonnet 5.5 par défaut depuis le 26/10.
    MEMOIRE_MODELE: str = ""

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
    # Produit Stripe de l'offre Essentiel (prod_…), créé hors code. Vide = offre
    # affichée mais pas encore ouverte au paiement en ligne (503 explicite).
    STRIPE_PRODUCT_ESSENTIEL: str = ""
    # Produits Stripe des offres Pro et Business (prod_…). Vides avec une clé de
    # test : produits du mode test (PRODUITS_STRIPE_MODE_TEST). Vides avec une clé
    # de production : refus de démarrer hors DEBUG (voir plus bas).
    STRIPE_PRODUCT_PRO: str = ""
    STRIPE_PRODUCT_BUSINESS: str = ""

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
        if cle_stripe_de_production(self.STRIPE_SECRET_KEY):
            # Restes-2 — avec une clé réelle, les produits du mode test n'existent pas :
            # le paiement Pro ou Business répondrait « Tarif indisponible ».
            for nom, offre in (("STRIPE_PRODUCT_PRO", "pro"), ("STRIPE_PRODUCT_BUSINESS", "business")):
                valeur = getattr(self, nom)
                if not valeur or valeur == PRODUITS_STRIPE_MODE_TEST[offre]:
                    problems.append(
                        f"{nom} vide ou produit du mode test avec une clé Stripe de production — "
                        "le paiement répondrait « Tarif indisponible » : créer le produit en mode réel "
                        "et poser son identifiant prod_…"
                    )
        if "localhost" in self.FRONTEND_URL or "127.0.0.1" in self.FRONTEND_URL:
            problems.append(
                "FRONTEND_URL pointe sur localhost — CORS bloquerait le domaine réel et les redirections Stripe seraient cassées"
            )
        if self.SYNORIX_ANALYSE_DEMO:
            # Décision de Mohamed du 25/10 : jamais de jeu de démonstration en
            # production — une clé refusée y enregistrerait de fausses analyses.
            problems.append(
                "SYNORIX_ANALYSE_DEMO=1 hors DEBUG — le jeu de démonstration enregistrerait de "
                "fausses analyses comme de vraies : retirer ce drapeau (réservé au développement local)"
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
