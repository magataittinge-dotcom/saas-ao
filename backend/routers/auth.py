import uuid
import jwt
import httpx
from jwt import PyJWKClient
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from config import get_settings
from models.user import User
from models.organization import Organization

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
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Token invalide: {e}")


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

    # 4. Fully new user — create org + user
    org = Organization(
        name=name,
        siret="00000000000000",
        plan="free",
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


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/me")
def get_me(user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    return {"user": _user_response(user), "organization": org}


@router.post("/sync")
def sync_onboarding(
    payload: dict,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Post-signup: set organization name, SIRET, plan."""
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    if payload.get("organization_name"):
        org.name = payload["organization_name"]
    if payload.get("siret"):
        org.siret = payload["siret"]
    if payload.get("plan") and payload["plan"] in ("free", "pro", "business"):
        org.plan = payload["plan"]

    db.commit()
    db.refresh(org)
    db.refresh(user)
    return {"user": _user_response(user), "organization": org}


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
