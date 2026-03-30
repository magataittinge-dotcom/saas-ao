"""
Seed script: insert a test user directly into the database.
Run from backend/: python seed_test_user.py
"""
import uuid
from datetime import datetime

from passlib.context import CryptContext
from database import SessionLocal, Base, engine
from models import Organization, User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Test user config ────────────────────────────────
EMAIL    = "test@test.fr"
PASSWORD = "Test1234!"
NAME     = "Mohamed Test"
ORG_NAME = "OZDEM TEST"
SIRET    = "12345678901234"
PLAN     = "pro"

# ── Ensure tables exist ─────────────────────────────
Base.metadata.create_all(bind=engine)

db = SessionLocal()
try:
    # Check if user already exists
    existing = db.query(User).filter(User.email == EMAIL).first()
    if existing:
        print(f"User {EMAIL} already exists (id={existing.id}). Skipping.")
        db.close()
        exit(0)

    # Check if SIRET already taken
    existing_org = db.query(Organization).filter(Organization.siret == SIRET).first()

    if existing_org:
        org = existing_org
        print(f"Organization '{org.name}' already exists, reusing.")
    else:
        org = Organization(
            id=str(uuid.uuid4()),
            name=ORG_NAME,
            siret=SIRET,
            plan=PLAN,
        )
        db.add(org)
        db.flush()
        print(f"Created organization '{ORG_NAME}' (plan={PLAN})")

    user = User(
        id=str(uuid.uuid4()),
        organization_id=org.id,
        email=EMAIL,
        password_hash=pwd_context.hash(PASSWORD),
        name=NAME,
        role="admin",
    )
    db.add(user)
    db.commit()

    print(f"Created user: {EMAIL} / {PASSWORD}")
    print(f"Organization: {ORG_NAME} (plan={PLAN})")
    print("Done. You can now log in.")

except Exception as e:
    db.rollback()
    print(f"Error: {e}")
finally:
    db.close()
