import logging
import re
import time as _time_mod
from datetime import datetime
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
    billing,
    notifications,
    stripe_billing,
    progress,
    calculators,
    rag,
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
            if "deleted_at" not in existing:
                with engine.begin() as conn:
                    conn.execute(text(
                        'ALTER TABLE "references" ADD COLUMN deleted_at TIMESTAMP'
                    ))
                    conn.execute(text(
                        'CREATE INDEX IF NOT EXISTS '
                        'ix_references_deleted_at ON "references" (deleted_at)'
                    ))
                logger.info("Added column references.deleted_at (+index)")

        # ── projects.deleted_at (soft-delete) ──────────────────────────────
        if insp.has_table("projects"):
            existing = {c["name"] for c in insp.get_columns("projects")}
            if "deleted_at" not in existing:
                with engine.begin() as conn:
                    conn.execute(text(
                        "ALTER TABLE projects ADD COLUMN deleted_at TIMESTAMP"
                    ))
                    conn.execute(text(
                        "CREATE INDEX IF NOT EXISTS "
                        "ix_projects_deleted_at ON projects (deleted_at)"
                    ))
                logger.info("Added column projects.deleted_at (+index)")

        # ── documents.deleted_at (soft-delete) ─────────────────────────────
        if insp.has_table("documents"):
            existing = {c["name"] for c in insp.get_columns("documents")}
            if "deleted_at" not in existing:
                with engine.begin() as conn:
                    conn.execute(text(
                        "ALTER TABLE documents ADD COLUMN deleted_at TIMESTAMP"
                    ))
                    conn.execute(text(
                        "CREATE INDEX IF NOT EXISTS "
                        "ix_documents_deleted_at ON documents (deleted_at)"
                    ))
                logger.info("Added column documents.deleted_at (+index)")

        # ── organizations.billing_provider / billing_country ──────────────
        # Pluggable billing provider — added Apr 2026 so we can migrate
        # the billing entity (Stripe FR → Stripe UAE in 2027) without code
        # changes. Existing rows default to ('stripe', COUNTRY_CODE).
        if insp.has_table("organizations"):
            existing = {c["name"] for c in insp.get_columns("organizations")}
            from config import get_locale_config as _glc
            default_country = _glc().country_code
            if "billing_provider" not in existing:
                with engine.begin() as conn:
                    conn.execute(text(
                        "ALTER TABLE organizations "
                        "ADD COLUMN billing_provider VARCHAR(32) "
                        "NOT NULL DEFAULT 'stripe'"
                    ))
                    conn.execute(text(
                        "CREATE INDEX IF NOT EXISTS "
                        "ix_organizations_billing_provider ON organizations (billing_provider)"
                    ))
                logger.info("Added column organizations.billing_provider (+index)")
            if "billing_country" not in existing:
                with engine.begin() as conn:
                    conn.execute(text(
                        "ALTER TABLE organizations "
                        "ADD COLUMN billing_country VARCHAR(2) "
                        f"NOT NULL DEFAULT '{default_country}'"
                    ))
                logger.info(f"Added column organizations.billing_country default={default_country!r}")
            # FK indexes used by webhook lookups (already added in night perf
            # work for org-scoped ones; this covers the customer/sub IDs).
            if "stripe_customer_id" in existing:
                with engine.begin() as conn:
                    conn.execute(text(
                        "CREATE INDEX IF NOT EXISTS "
                        "ix_organizations_stripe_customer_id "
                        "ON organizations (stripe_customer_id)"
                    ))
            if "stripe_subscription_id" in existing:
                with engine.begin() as conn:
                    conn.execute(text(
                        "CREATE INDEX IF NOT EXISTS "
                        "ix_organizations_stripe_subscription_id "
                        "ON organizations (stripe_subscription_id)"
                    ))

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

        # ── Postgres-only: extend checklist_status ENUM with non_applicable ─
        if is_postgres:
            try:
                with engine.begin() as conn:
                    conn.execute(text(
                        "ALTER TYPE checklist_status ADD VALUE IF NOT EXISTS 'non_applicable'"
                    ))
            except Exception as exc:
                logger.warning("ALTER TYPE checklist_status skipped: %s", exc)

            # project_status gains 'analyzed' — set on a project once the
            # compliance items extracted by the AI are committed.
            try:
                with engine.begin() as conn:
                    conn.execute(text(
                        "ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'analyzed'"
                    ))
            except Exception as exc:
                logger.warning("ALTER TYPE project_status skipped: %s", exc)

        # ── Performance indexes — additive, idempotent (CREATE INDEX IF NOT EXISTS) ─
        _ensure_performance_indexes(insp)

        # ── One-shot: re-tag project_documents using the new detector ─────
        # Bump the version when the detector gains rules that should re-evaluate
        # historical rows. v2: adds DCE-XX corps d'état CCTP recognition.
        # v3: adds diagnostic / notice / dt / pgc_sps / planning types and
        # fixes AE detection for prefixed filenames ("2829 - AE.pdf").
        # v4: sanitize file_name from CP437/CP850 control char leftovers
        # (U+0090, U+0082) — original bytes are gone, but at least display is clean.
        if insp.has_table("project_documents"):
            _backfill_project_doc_types(version="v3")
            _backfill_filename_encoding(version="v4")

    except Exception as e:
        logger.warning(f"Schema migration skipped: {e}")


def _ensure_performance_indexes(insp) -> None:
    """Create FK + hot-path indexes idempotently (no-op if they already exist).

    Postgres does NOT auto-index FKs. This costs us heavily on filtered queries
    like `Document.organization_id == org_id`. SQLAlchemy index=True helps on
    fresh DBs (via Base.metadata.create_all) but does nothing on tables that
    pre-exist without those indexes — so we add them here too.
    """
    from sqlalchemy import text

    # (table, column, index_name) tuples — index_name kept short for Postgres.
    indexes = [
        ("projects", "organization_id", "ix_projects_organization_id"),
        ("projects", "status", "ix_projects_status"),
        ("project_documents", "project_id", "ix_project_documents_project_id"),
        ("project_documents", "type", "ix_project_documents_type"),
        ("documents", "organization_id", "ix_documents_organization_id"),
        ("documents", "type", "ix_documents_type"),
        ("documents", "expiry_date", "ix_documents_expiry_date"),
        ("references", "organization_id", "ix_references_organization_id"),
        ("checklist_items", "project_id", "ix_checklist_items_project_id"),
        ("checklist_items", "linked_document_id", "ix_checklist_items_linked_document_id"),
        ("checklist_items", "template_project_doc_id", "ix_checklist_items_template_doc_id"),
        ("checklist_items", "completed_project_doc_id", "ix_checklist_items_completed_doc_id"),
        ("compliance_items", "project_id", "ix_compliance_items_project_id"),
        ("team_members", "organization_id", "ix_team_members_organization_id"),
    ]
    for table, column, name in indexes:
        if not insp.has_table(table):
            continue
        try:
            with engine.begin() as conn:
                # Postgres needs quoted identifiers for "references" (reserved keyword).
                t_q = f'"{table}"' if table == "references" else table
                conn.execute(text(
                    f"CREATE INDEX IF NOT EXISTS {name} ON {t_q} ({column})"
                ))
        except Exception as exc:
            logger.warning("perf index %s skipped: %s", name, exc)


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


def _backfill_filename_encoding(version: str) -> None:
    """One-shot sanitisation of project_documents.file_name fields polluted by
    earlier broken cp437→latin-1 decoding. The control chars (U+0080-U+009F)
    can't be inverted without the original bytes — we just replace them with
    '_' the same way the new decoder does.
    Idempotent via a per-version marker file in uploads/."""
    import re as _re
    uploads_dir = Path(__file__).parent / "uploads"
    uploads_dir.mkdir(exist_ok=True)
    marker = uploads_dir / f".backfill_filename_encoding_{version}.done"
    if marker.exists():
        return

    try:
        from sqlalchemy.orm import sessionmaker
        from models.project import ProjectDocument

        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()
        try:
            # Match any ASCII control or C1 control char (0x00-0x1f, 0x7f-0x9f).
            pat = _re.compile(r'[\x00-\x1f\x7f-\x9f]')
            count = 0
            for d in db.query(ProjectDocument).all():
                if not d.file_name:
                    continue
                if pat.search(d.file_name):
                    cleaned = pat.sub('_', d.file_name)
                    cleaned = _re.sub(r'_+', '_', cleaned).strip('_. ')
                    d.file_name = cleaned or "fichier_sans_nom"
                    count += 1
            if count:
                db.commit()
                logger.info(f"Backfill {version}: sanitized {count} project_document file_names")
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
# CSP — strict in prod, relaxed in DEBUG (Vite needs unsafe-inline for HMR).
# 'self' covers same-origin XHR (the SPA hits the API at the same host in prod
# via the reverse proxy). Stripe.js is whitelisted because the front loads it
# for the checkout / portal flows.
_CSP_PROD = (
    "default-src 'self'; "
    "script-src 'self' https://js.stripe.com; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com data:; "
    "img-src 'self' data: blob: https://maps.googleapis.com https://maps.gstatic.com; "
    "connect-src 'self' https://api.stripe.com https://*.clerk.accounts.dev "
    "https://clerk.synorix.fr https://*.synorix.fr; "
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com; "
    "object-src 'none'; base-uri 'self'; form-action 'self'; "
    "frame-ancestors 'none'; upgrade-insecure-requests"
)
_PERMISSIONS_POLICY = (
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
    "magnetometer=(), microphone=(), payment=(self), usb=()"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = _PERMISSIONS_POLICY
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-site"
        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )
            response.headers["Content-Security-Policy"] = _CSP_PROD
        return response


app.add_middleware(SecurityHeadersMiddleware)


# ── Progression de RÉCEPTION des uploads DCE (fix gel UI à 30 %) ─────────────
# FastAPI lit et spoole TOUT le multipart AVANT d'exécuter l'endpoint : sur un
# gros ZIP, cette fenêtre (~10 s) était muette et la barre restait figée.
# Ce middleware ASGI pur compte les octets réellement reçus et publie la
# progression 0→30 (échelle du pipeline_tracker « uploading ») sur le bus SSE,
# throttlée. Write-only : il ne lit rien, n'expose rien, ne bloque jamais
# (l'auth de l'endpoint s'applique ensuite normalement).
_DOC_UPLOAD_PATH_RE = re.compile(r"^/api/projects/([^/]+)/documents$")


class UploadReceiveProgressMiddleware:
    def __init__(self, app):  # pure ASGI (BaseHTTPMiddleware bufferise)
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "POST":
            return await self.app(scope, receive, send)
        m = _DOC_UPLOAD_PATH_RE.match(scope.get("path", ""))
        if not m:
            return await self.app(scope, receive, send)

        project_id = m.group(1)
        headers = dict(scope.get("headers") or [])
        try:
            total = int(headers.get(b"content-length", b"0"))
        except (TypeError, ValueError):
            total = 0
        if total <= 0:
            return await self.app(scope, receive, send)

        from services import progress_bus

        received = 0
        last_pub = 0.0

        async def receive_with_progress():
            nonlocal received, last_pub
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                now = _time_mod.monotonic()
                if now - last_pub >= 0.4 or not message.get("more_body", False):
                    last_pub = now
                    progress_bus.publish(project_id, "progress", {
                        "status": "uploading",
                        "progress": round(min(received / total, 1.0) * 30, 1),
                        "detail": f"{received / 1e6:.0f} / {total / 1e6:.0f} Mo reçus",
                    })
            return message

        return await self.app(scope, receive_with_progress, send)


app.add_middleware(UploadReceiveProgressMiddleware)

# CORS — strict allowlist. The Vite dev server is only added in DEBUG.
_cors_origins = [settings.FRONTEND_URL]
if settings.DEBUG:
    if "localhost" in settings.FRONTEND_URL and "5173" not in settings.FRONTEND_URL:
        _cors_origins.append("http://localhost:5173")
    if "localhost" in settings.FRONTEND_URL and "3000" not in settings.FRONTEND_URL:
        _cors_origins.append("http://localhost:3000")

# Refuse the catch-all * even if mis-configured.
_cors_origins = [o for o in _cors_origins if o and o != "*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    max_age=600,
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
app.include_router(rag.router, prefix="/api/rag", tags=["rag"])
app.include_router(export.router, prefix="/api/projects", tags=["export"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(stripe_billing.router, prefix="/api/stripe", tags=["stripe"])
app.include_router(billing.router, prefix="/api/billing", tags=["billing"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
app.include_router(progress.router, prefix="/api/projects", tags=["progress"])
app.include_router(calculators.router, prefix="/api/calculators", tags=["calculators"])
app.include_router(file_serve_router, prefix="/api/files", tags=["files"])


_APP_BOOTED_AT = datetime.utcnow()


@app.get("/api/health")
def health_check():
    """Liveness + readiness probe.

    Returns degraded markers without ever 5xx-ing — load balancers should
    keep traffic flowing while the service self-heals (e.g. transient PG
    blip). External monitor reads `status=ok` and `db=up`.
    """
    from datetime import datetime as _dt
    import shutil as _shutil
    from sqlalchemy import text as _text

    db_status = "up"
    try:
        with engine.connect() as conn:
            conn.execute(_text("SELECT 1"))
    except Exception as exc:
        logger.warning("health: DB check failed: %s", exc)
        db_status = "down"

    disk_free_gb: float | None = None
    try:
        usage = _shutil.disk_usage(str(_uploads_dir))
        disk_free_gb = round(usage.free / (1024 ** 3), 2)
    except Exception:
        pass

    uptime_s = int((_dt.utcnow() - _APP_BOOTED_AT).total_seconds())

    return {
        "status": "ok" if db_status == "up" else "degraded",
        "db": db_status,
        "version": "1.0.0",
        "uptime_seconds": uptime_s,
        "disk_free_gb": disk_free_gb,
        "ai_api_configured": bool(settings.ANTHROPIC_API_KEY),
        "stripe_configured": bool(settings.STRIPE_SECRET_KEY),
    }


@app.get("/api/metrics")
def metrics():
    """Lightweight metrics endpoint, JSON only (no Prometheus exposition).

    Use it for the night/morning ops report. Wire to Prometheus later by
    placing a sidecar that scrapes this and rewrites to text/exposition.
    """
    from sqlalchemy import func as _func
    from services.cache import org_cache as _cache
    from models.organization import Organization as _Org
    from models.project import Project as _Project
    from models.document import Document as _Doc
    from models.audit_log import AuditLog as _Audit
    from datetime import timedelta as _td

    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        now = datetime.utcnow()
        since_24h = now - _td(hours=24)
        m = {
            "uptime_seconds": int((now - _APP_BOOTED_AT).total_seconds()),
            "orgs_total": db.query(_func.count(_Org.id)).scalar() or 0,
            "projects_total": db.query(_func.count(_Project.id)).filter(
                _Project.deleted_at.is_(None)
            ).scalar() or 0,
            "documents_total": db.query(_func.count(_Doc.id)).filter(
                _Doc.deleted_at.is_(None)
            ).scalar() or 0,
            "audit_24h_total": db.query(_func.count(_Audit.id)).filter(
                _Audit.created_at >= since_24h
            ).scalar() or 0,
            "audit_24h_memoire_generate": db.query(_func.count(_Audit.id)).filter(
                _Audit.created_at >= since_24h,
                _Audit.action == "memoire.generate",
            ).scalar() or 0,
            "audit_24h_export_zip": db.query(_func.count(_Audit.id)).filter(
                _Audit.created_at >= since_24h,
                _Audit.action == "export.zip",
            ).scalar() or 0,
            "audit_24h_vault_upload": db.query(_func.count(_Audit.id)).filter(
                _Audit.created_at >= since_24h,
                _Audit.action == "vault.upload",
            ).scalar() or 0,
            "cache_stats": _cache.stats(),
        }
        return m
    finally:
        db.close()


# NOTE: We deliberately do NOT mount /uploads as a public StaticFiles route.
# All file access goes through /api/files/view/... (signed time-limited URLs
# minted via /api/files/sign — auth + ownership). See routers/file_serve.py.
_uploads_dir = Path(__file__).parent / "uploads"
_uploads_dir.mkdir(exist_ok=True)
