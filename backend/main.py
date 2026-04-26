import logging
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from config import get_settings
from database import Base, engine

logger = logging.getLogger(__name__)

# Import routers
from routers import (
    auth,
    organizations,
    users,
    documents,
    references,
    projects,
    analysis,
    compliance,
    candidature,
    memoire,
    memoire_config,
    export,
    dashboard,
    stripe_billing,
)
from routers.file_serve import router as file_serve_router

settings = get_settings()

# Create tables
Base.metadata.create_all(bind=engine)


def _ensure_schema_columns():
    """Idempotent runtime migrations for columns added after initial deploy."""
    from sqlalchemy import inspect, text
    from models.document import DOCUMENT_TYPES
    from models.project import PROJECT_DOC_TYPES

    try:
        insp = inspect(engine)
        is_postgres = engine.dialect.name == "postgresql"

        # ── project_documents.is_user_completed (legacy migration) ────────
        if insp.has_table("project_documents"):
            existing = {c["name"] for c in insp.get_columns("project_documents")}
            if "is_user_completed" not in existing:
                with engine.begin() as conn:
                    conn.execute(text(
                        "ALTER TABLE project_documents "
                        "ADD COLUMN is_user_completed BOOLEAN NOT NULL DEFAULT FALSE"
                    ))
                logger.info("Added column project_documents.is_user_completed")

        # ── checklist_items: source_kind + template/completed FKs ─────────
        if insp.has_table("checklist_items"):
            existing = {c["name"] for c in insp.get_columns("checklist_items")}
            with engine.begin() as conn:
                if "source_kind" not in existing:
                    conn.execute(text(
                        "ALTER TABLE checklist_items "
                        "ADD COLUMN source_kind VARCHAR(20) NOT NULL DEFAULT 'vault'"
                    ))
                    if is_postgres:
                        conn.execute(text(
                            "ALTER TABLE checklist_items ADD CONSTRAINT "
                            "checklist_items_source_kind_check "
                            "CHECK (source_kind IN ('vault', 'dce_template'))"
                        ))
                    logger.info("Added column checklist_items.source_kind")
                if "template_project_doc_id" not in existing:
                    conn.execute(text(
                        "ALTER TABLE checklist_items "
                        "ADD COLUMN template_project_doc_id VARCHAR "
                        "REFERENCES project_documents(id)"
                    ))
                    logger.info("Added column checklist_items.template_project_doc_id")
                if "completed_project_doc_id" not in existing:
                    conn.execute(text(
                        "ALTER TABLE checklist_items "
                        "ADD COLUMN completed_project_doc_id VARCHAR "
                        "REFERENCES project_documents(id)"
                    ))
                    logger.info("Added column checklist_items.completed_project_doc_id")

        # ── references.attestation_document_id ────────────────────────────
        if insp.has_table("references"):
            existing = {c["name"] for c in insp.get_columns("references")}
            if "attestation_document_id" not in existing:
                with engine.begin() as conn:
                    conn.execute(text(
                        "ALTER TABLE \"references\" "
                        "ADD COLUMN attestation_document_id VARCHAR "
                        "REFERENCES documents(id)"
                    ))
                logger.info("Added column references.attestation_document_id")

        # ── Postgres-only: convert native ENUMs to VARCHAR + CHECK ────────
        if is_postgres:
            _migrate_pg_enum_to_check(
                table="documents",
                column="type",
                enum_type="document_type",
                allowed=DOCUMENT_TYPES,
                check_name="documents_type_check",
                renames={"dc1": "autre", "dc2": "autre"},   # vault dc1/dc2 retired
            )
            _migrate_pg_enum_to_check(
                table="project_documents",
                column="type",
                enum_type="project_doc_type",
                allowed=PROJECT_DOC_TYPES,
                check_name="project_documents_type_check",
                renames={
                    "acte_engagement": "acte_engagement_template",
                    "dpgf": "dpgf_template",
                },
            )

        # ── Wipe checklist_items (decision validée : re-run propre) ───────
        if insp.has_table("checklist_items"):
            with engine.begin() as conn:
                deleted = conn.execute(text("DELETE FROM checklist_items")).rowcount
                if deleted:
                    logger.info(f"Wiped {deleted} checklist_items rows for re-run")

        # ── One-shot: re-tag project_documents using the new detector ─────
        # Bump the version when the detector gains rules that should re-evaluate
        # historical rows. v2: adds DCE-XX corps d'état CCTP recognition.
        if insp.has_table("project_documents"):
            _backfill_project_doc_types(version="v2")

    except Exception as e:
        logger.warning(f"Schema migration skipped: {e}")


def _backfill_project_doc_types(version: str):
    """One-shot backfill: re-run _detect_doc_type on every project_documents row
    so that previously merged or unrecognized types get reclassified.
    Idempotent via a per-version marker file in uploads/ (gitignored)."""
    uploads_dir = Path(__file__).parent / "uploads"
    uploads_dir.mkdir(exist_ok=True)
    marker = uploads_dir / f".backfill_doc_types_{version}.done"
    if marker.exists():
        return

    try:
        from sqlalchemy.orm import sessionmaker
        from collections import Counter

        from routers.projects import _detect_doc_type
        from models.project import ProjectDocument

        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()
        try:
            docs = db.query(ProjectDocument).all()
            if not docs:
                marker.touch()
                return

            before = Counter(d.type for d in docs)
            transitions: Counter = Counter()

            for d in docs:
                new_type = _detect_doc_type(d.file_name or "", "autre")
                if new_type != d.type:
                    transitions[(d.type, new_type)] += 1
                    d.type = new_type

            if transitions:
                db.commit()

            after = Counter(d.type for d in docs)
            logger.info(
                f"Backfill {version}: {len(docs)} project_documents inspected, "
                f"{sum(transitions.values())} reclassified"
            )
            logger.info(f"  Before: {dict(before)}")
            logger.info(f"  After:  {dict(after)}")
            for (old, new), n in transitions.items():
                logger.info(f"  {old} → {new}: {n}")
        finally:
            db.close()

        marker.touch()
    except Exception as e:
        logger.warning(f"Backfill {version} skipped: {e}")


def _migrate_pg_enum_to_check(table, column, enum_type, allowed, check_name, renames):
    """Convert a Postgres native ENUM column to VARCHAR + CHECK constraint.
    Idempotent : no-op if the column is already VARCHAR.
    Applies the `renames` map before adding the new CHECK constraint."""
    from sqlalchemy import text

    with engine.begin() as conn:
        is_enum = conn.execute(text("""
            SELECT 1 FROM information_schema.columns
            WHERE table_name = :t AND column_name = :c AND udt_name = :u
        """), {"t": table, "c": column, "u": enum_type}).scalar()

        if is_enum:
            conn.execute(text(
                f'ALTER TABLE "{table}" ALTER COLUMN "{column}" '
                f'TYPE VARCHAR(64) USING "{column}"::text'
            ))
            logger.info(f"Converted {table}.{column} from ENUM {enum_type} to VARCHAR")

        for old_value, new_value in renames.items():
            res = conn.execute(text(
                f'UPDATE "{table}" SET "{column}" = :new WHERE "{column}" = :old'
            ), {"new": new_value, "old": old_value})
            if res.rowcount:
                logger.info(f"Renamed {res.rowcount} {table}.{column} '{old_value}' → '{new_value}'")

        # Drop legacy ENUM type if no other column references it.
        conn.execute(text(f'DROP TYPE IF EXISTS {enum_type} CASCADE'))

        # (Re)create the CHECK constraint with current allowed values.
        conn.execute(text(
            f'ALTER TABLE "{table}" DROP CONSTRAINT IF EXISTS {check_name}'
        ))
        allowed_sql = "', '".join(allowed)
        conn.execute(text(
            f'ALTER TABLE "{table}" ADD CONSTRAINT {check_name} '
            f"CHECK (\"{column}\" IN ('{allowed_sql}'))"
        ))


_ensure_schema_columns()

# ── Rate limiter ─────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

app = FastAPI(
    title="SaaS AO BTP API",
    description="API for automating BTP tender responses",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ── Global exception handler — never leak stack traces in prod ───────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    if settings.DEBUG:
        return JSONResponse(status_code=500, content={"detail": str(exc)})
    return JSONResponse(status_code=500, content={"detail": "Erreur interne du serveur"})


# ── Security headers middleware ──────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# CORS
_cors_origins = [settings.FRONTEND_URL]
# Always allow Vite dev server (port 5173) in addition to configured origin
if "localhost" in settings.FRONTEND_URL and "5173" not in settings.FRONTEND_URL:
    _cors_origins.append("http://localhost:5173")
if "localhost" in settings.FRONTEND_URL and "3000" not in settings.FRONTEND_URL:
    _cors_origins.append("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(organizations.router, prefix="/api/organizations", tags=["organizations"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(references.router, prefix="/api/references", tags=["references"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(analysis.router, prefix="/api/projects", tags=["analysis"])
app.include_router(compliance.router, prefix="/api/projects", tags=["compliance"])
app.include_router(candidature.router, prefix="/api/projects", tags=["candidature"])
app.include_router(memoire.router, prefix="/api/projects", tags=["memoire"])
app.include_router(memoire_config.router, prefix="/api/memoire-config", tags=["memoire-config"])
app.include_router(export.router, prefix="/api/projects", tags=["export"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(stripe_billing.router, prefix="/api/stripe", tags=["stripe"])
app.include_router(file_serve_router, prefix="/api/files", tags=["files"])


@app.get("/api/health")
def health_check():
    return {"status": "ok", "version": "1.0.0"}


# Serve uploaded files
_uploads_dir = Path(__file__).parent / "uploads"
_uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")
