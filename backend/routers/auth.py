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
from models.user import User
from models.organization import Organization
from schemas.auth import SyncRequest
from services import insee_service

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
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Auth failed: token expiré")
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.InvalidTokenError as e:
        logger.warning(f"Auth failed: token invalide — {type(e).__name__}")
        raise HTTPException(status_code=401, detail="Token invalide")


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
    org = Organization(
        name=name,
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
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    payload = _decode_clerk_token(credentials.credentials)
    clerk_user_id = payload.get("sub")
    if not clerk_user_id:
        raise HTTPException(status_code=401, detail="Token invalide: sub manquant")
    return _sync_clerk_user(clerk_user_id, db)


def get_auth_user_short(
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
        raise HTTPException(status_code=401, detail="Token invalide: sub manquant")
    db = SessionLocal()
    try:
        user = _sync_clerk_user(clerk_user_id, db)
        db.refresh(user)
        db.expunge(user)
        return user
    finally:
        db.close()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/me")
def get_me(user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    return {"user": _user_response(user), "organization": org}


@router.post("/sync")
def sync_onboarding(
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
        )

    db.commit()
    db.refresh(org)
    if user in db:  # même session que get_db (prod) ; sinon l'objet est déjà à jour
        db.refresh(user)
    response = {"user": _user_response(user), "organization": org}
    if siret_warning:
        response["siret_warning"] = siret_warning
    return response


def _apply_siret(org: Organization, raw_siret: str, db: Session, name_provided: bool = False):
    """Valide, dédoublonne et enrichit le profil org depuis Sirene.

    Retourne un message d'avertissement à afficher, ou None si tout est ok."""
    try:
        siret = insee_service.normalize_siret(raw_siret)
    except insee_service.SiretFormatError as exc:
        return f"SIRET invalide : {exc} Vous pourrez le corriger dans Mon entreprise."

    duplicate = db.query(Organization).filter(
        Organization.siret == siret,
        Organization.id != org.id,
    ).first()
    if duplicate:
        org.trial_granted = False
        return (
            "Ce SIRET est déjà associé à un compte Synorix : l'essai gratuit a "
            "déjà été utilisé pour cette entreprise. Votre compte est créé — "
            "passez au plan Pro pour lancer vos analyses."
        )

    org.siret = siret
    try:
        info = insee_service.lookup_siret(siret)
    except insee_service.SiretNotFoundError:
        org.siret_verified = False
        return (
            "SIRET introuvable au répertoire Sirene — vérifiez le numéro ou "
            "complétez votre profil manuellement dans Mon entreprise."
        )
    except insee_service.SireneUnavailableError:
        org.siret_verified = False
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
