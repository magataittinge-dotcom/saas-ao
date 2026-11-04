import logging
import uuid
import jwt
import httpx
from jwt import PyJWKClient
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from starlette.requests import Request as StarletteRequest

from database import get_db
from config import get_settings
from services.rate_limit import limiter
from models.user import User
from models.organization import Organization
from schemas.auth import SyncRequest
from services import insee_service
from services.raison_sociale import organisation_publique

logger = logging.getLogger(__name__)

router = APIRouter()
settings = get_settings()
bearer = HTTPBearer()

# ── Clerk JWKS client (caches keys automatically) ────────────────────────────
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(settings.CLERK_JWKS_URL)
    return _jwks_client


# Origines locales du front, acceptées pour `azp` en développement (DEBUG) seulement : ce sont celles
# que le CORS local ajoute aussi (main.py).
_ORIGINES_LOCALES_DEV = (
    "http://localhost:3000", "http://localhost:5173",
    "http://127.0.0.1:3000", "http://127.0.0.1:5173",
)


def _origines_autorisees() -> set[str]:
    """Origines qui ont le droit d'obtenir un jeton pour cette API : `FRONTEND_URL`, et, en DEBUG,
    les origines locales du front. Lues à chaque appel (réglages, tests)."""
    origines = {(settings.FRONTEND_URL or "").rstrip("/")} - {""}
    if settings.DEBUG:
        origines |= set(_ORIGINES_LOCALES_DEV)
    return origines


def _verifier_azp(payload: dict) -> None:
    """Revendication `azp` (« authorized party ») : l'origine où le navigateur a obtenu le jeton.

    Avec une seule instance Clerk partagée entre le PC de développement et synorix.tech, un jeton
    obtenu sur `http://localhost:3000` serait sinon accepté par la production.
    - `azp` présent : doit être une origine autorisée, sinon 401 ;
    - `azp` absent : accepté. Clerk le pose sur les jetons de session émis à un navigateur ; un jeton
      sans `azp` vient de l'API Backend de Clerk (clé secrète), et le SDK officiel de Clerk ne contrôle
      `azp` que s'il est présent. La signature reste vérifiée dans tous les cas."""
    if "azp" not in payload:
        return
    azp = payload["azp"]
    if not isinstance(azp, str) or azp.rstrip("/") not in _origines_autorisees():
        logger.warning("Auth failed: origine du jeton (azp) non autorisée")
        raise HTTPException(status_code=401, detail="Token invalide")


def _decode_clerk_token(token: str) -> dict:
    """Decode and validate a Clerk JWT using the JWKS endpoint."""
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        logger.warning("Auth failed: token expiré")
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.InvalidTokenError as e:
        logger.warning(f"Auth failed: token invalide — {type(e).__name__}")
        raise HTTPException(status_code=401, detail="Token invalide")
    except jwt.PyJWKClientConnectionError as e:
        # JWKS de Clerk injoignable : le jeton n'est pas en cause.
        logger.warning(f"Auth indisponible : JWKS de Clerk injoignable — {type(e).__name__}")
        raise HTTPException(
            status_code=503,
            detail="Authentification momentanément indisponible. Réessayez dans un instant.",
        )
    except jwt.PyJWKClientError as e:
        # `kid` inconnu (jeton forgé ou clé retirée) : jeton invalide. Cette
        # exception n'hérite pas de InvalidTokenError ; sans ce bloc, 500 et
        # pile d'appels dans les journaux, avec le `kid` choisi par l'appelant.
        logger.warning(f"Auth failed: token invalide — {type(e).__name__}")
        raise HTTPException(status_code=401, detail="Token invalide")

    _verifier_azp(payload)
    return payload


def _fetch_clerk_user(clerk_user_id: str) -> dict:
    """Call Clerk Backend API to get user info (email, name)."""
    resp = httpx.get(
        f"https://api.clerk.com/v1/users/{clerk_user_id}",
        headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Impossible de récupérer l'utilisateur Clerk")
    return resp.json()


def _sync_clerk_user(clerk_user_id: str, db: Session) -> User:
    """Find or create a local DB user from a Clerk user ID."""
    # 1. Already linked?
    user = db.query(User).filter(User.clerk_id == clerk_user_id).first()
    if user:
        return user

    # 2. Fetch from Clerk API
    clerk_data = _fetch_clerk_user(clerk_user_id)
    email = (clerk_data.get("email_addresses") or [{}])[0].get("email_address", "")
    first_name = clerk_data.get("first_name") or ""
    last_name = clerk_data.get("last_name") or ""
    name = f"{first_name} {last_name}".strip() or email.split("@")[0]

    # 3. Existing user with same email? Link them.
    user = db.query(User).filter(User.email == email).first()
    if user:
        user.clerk_id = clerk_user_id
        db.commit()
        db.refresh(user)
        return user

    # 4. Fully new user — create org + user.
    # billing_country tracks where the billing entity is registered so a
    # future provider/country migration can target a specific cohort.
    from config import get_locale_config
    locale_cfg = get_locale_config()
    # Raison sociale vide tant que le SIRET n'est pas validé : jamais le nom du compte (décision du 2/11,
    # C8/R20). `organizations.name` est non nul : chaîne vide, sans migration.
    org = Organization(
        name="",
        siret=None,
        plan="free",
        billing_provider="stripe",
        billing_country=locale_cfg.country_code,
    )
    db.add(org)
    db.flush()

    user = User(
        id=str(uuid.uuid4()),
        clerk_id=clerk_user_id,
        organization_id=org.id,
        email=email,
        name=name,
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ── Main dependency — used by all protected routes ────────────────────────────

def get_auth_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    payload = _decode_clerk_token(credentials.credentials)
    clerk_user_id = payload.get("sub")
    if not clerk_user_id:
        raise HTTPException(status_code=401, detail="Jeton invalide : identifiant non fourni")
    user = _sync_clerk_user(clerk_user_id, db)
    # Clé de rate-limit par org (S1.2) — non spoofable (liée au JWT validé),
    # contrairement à l'IP derrière un proxy. Lue par services.rate_limit.
    request.state.rl_key = f"org:{user.organization_id}"
    return user


def get_auth_user_short(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> User:
    """Variante de get_auth_user à session COURTE — pour les endpoints à réponse
    longue (SSE). Une session yield-ée par Depends(get_db) resterait ouverte
    jusqu'à la fin de la réponse, donc TOUT le flux → une connexion bloquée par
    client. Ici on ouvre/ferme immédiatement et on renvoie un User détaché
    (colonnes chargées : organization_id/id/email restent lisibles)."""
    from database import SessionLocal
    payload = _decode_clerk_token(credentials.credentials)
    clerk_user_id = payload.get("sub")
    if not clerk_user_id:
        raise HTTPException(status_code=401, detail="Jeton invalide : identifiant non fourni")
    db = SessionLocal()
    try:
        user = _sync_clerk_user(clerk_user_id, db)
        db.refresh(user)
        db.expunge(user)
        request.state.rl_key = f"org:{user.organization_id}"
        return user
    finally:
        db.close()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/me")
def get_me(user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    return {"user": _user_response(user), "organization": organisation_publique(org, db) if org else None}


@router.post("/sync")
@limiter.limit("10/minute")
def sync_onboarding(
    request: Request,
    payload: SyncRequest,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Post-signup: set organization name + SIRET (JAMAIS le plan).

    C2 — le SIRET est vérifié via l'API Sirene et pré-remplit le profil.
    Aucun échec Sirene ne bloque l'inscription (fallback saisie manuelle) ;
    seule règle dure : 1 SIRET = 1 essai gratuit (le doublon garde son compte
    mais perd l'essai). Le plan n'est modifiable QUE par les webhooks Stripe
    (R2 : sinon self-upgrade gratuit)."""
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    if payload.organization_name:
        org.name = payload.organization_name

    siret_warning = None
    if payload.siret:
        siret_warning = _apply_siret(
            org, payload.siret, db,
            name_provided=bool(payload.organization_name),
            depuis_profil=payload.depuis_profil,
        )

    db.commit()
    db.refresh(org)
    if user in db:  # même session que get_db (prod) ; sinon l'objet est déjà à jour
        db.refresh(user)
    response = {"user": _user_response(user), "organization": organisation_publique(org, db)}
    if siret_warning:
        response["siret_warning"] = siret_warning
    return response


def _apply_siret(org: Organization, raw_siret: str, db: Session, name_provided: bool = False,
                 depuis_profil: bool = False):
    """Valide, dédoublonne et enrichit le profil org depuis Sirene.

    Retourne un message d'avertissement à afficher, ou None si tout est ok.

    `depuis_profil` (G7) : saisi dans « Mon entreprise » — mêmes contrôles ; les phrases ne renvoient pas vers l'écran où
    se trouve déjà l'utilisateur, et un SIRET déjà pris n'enlève pas l'essai du compte (ce n'est pas une inscription)."""
    try:
        siret = insee_service.normalize_siret(raw_siret)
    except insee_service.SiretFormatError as exc:
        if depuis_profil:
            return str(exc)   # « Numéro SIRET invalide (clé de contrôle incorrecte). » se suffit à lui-même
        return f"SIRET invalide : {exc} Vous pourrez le corriger dans Mon entreprise."

    duplicate = db.query(Organization).filter(
        Organization.siret == siret,
        Organization.id != org.id,
    ).first()
    if duplicate and depuis_profil:
        return "Ce SIRET est déjà associé à un autre compte Synorix : il n'a pas été enregistré."
    if duplicate:
        org.trial_granted = False
        return (
            "Ce SIRET est déjà associé à un compte Synorix : l'essai gratuit a "
            "déjà été utilisé pour cette entreprise. Votre compte est créé — "
            "choisissez une offre pour lancer vos analyses."
        )

    org.siret = siret
    try:
        info = insee_service.lookup_siret(siret)
    except insee_service.SiretNotFoundError:
        org.siret_verified = False
        if depuis_profil:
            return "SIRET introuvable au répertoire Sirene : vérifiez le numéro. Il est enregistré, à vérifier."
        return (
            "SIRET introuvable au répertoire Sirene — vérifiez le numéro ou "
            "complétez votre profil manuellement dans Mon entreprise."
        )
    except insee_service.SireneUnavailableError:
        org.siret_verified = False
        if depuis_profil:
            return "Le répertoire Sirene est momentanément indisponible : le numéro est enregistré, à vérifier plus tard."
        return (
            "La vérification Sirene est momentanément indisponible — votre "
            "profil pourra être complété manuellement dans Mon entreprise."
        )

    org.siret_verified = True
    # La raison sociale officielle pré-remplit le nom, sauf si l'utilisateur
    # vient d'en saisir un lui-même dans ce même formulaire.
    if info.raison_sociale and not name_provided:
        org.name = info.raison_sociale
    if info.adresse and not org.address:
        org.address = info.adresse
    if info.naf_code:
        org.naf_code = info.naf_code
    if info.effectif_tranche:
        org.effectif_tranche = info.effectif_tranche
    return None


def _user_response(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "phone": user.phone,
        "role": user.role,
        "organization_id": user.organization_id,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
