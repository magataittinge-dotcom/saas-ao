import logging
import re
import time as _time_mod
from datetime import datetime
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
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

# ── Schéma : alembic est la source unique (R14) ───────────────────────────────
# Plus de DDL ad hoc au boot. Prod (postgres) : on EXIGE alembic à head
# (fail fast). Dev/test (sqlite ou DEBUG) : create_all de commodité.
from alembic.config import Config as _AlembicConfig
from alembic.script import ScriptDirectory as _ScriptDirectory
from alembic.runtime.migration import MigrationContext as _MigrationContext


def _assert_migrations_current() -> None:
    """Refuse de démarrer si la base n'est pas à la head alembic (R14).
    Le déploiement doit lancer `alembic upgrade head` (base vierge) ou avoir
    migré/stampé une base existante avant le boot — cf. docs/DEPLOYMENT.md."""
    cfg = _AlembicConfig(str(Path(__file__).parent / "alembic.ini"))
    head = _ScriptDirectory.from_config(cfg).get_current_head()
    with engine.connect() as conn:
        current = _MigrationContext.configure(conn).get_current_revision()
    if current != head:
        raise RuntimeError(
            f"Schéma non à jour (alembic à {current!r}, head {head!r}). "
            "Lancez `alembic upgrade head` avant de démarrer l'API."
        )


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


def _run_data_backfills() -> None:
    """One-shots de DONNÉES (pas du schéma), idempotents via marqueurs :
    re-tag des types de documents + nettoyage d'encodage des noms de fichiers.
    Distincts des migrations de schéma, désormais 100 % alembic (R14)."""
    from sqlalchemy import inspect
    try:
        if inspect(engine).has_table("project_documents"):
            _backfill_project_doc_types(version="v3")
            _backfill_filename_encoding(version="v4")
    except Exception as exc:
        logger.warning("Backfills de données ignorés: %s", exc)


def _prepare_schema() -> None:
    """Boot — R14 : prod (postgres, hors DEBUG) EXIGE alembic à head (fail
    fast) ; dev/test (sqlite ou DEBUG) crée le schéma via create_all. Plus
    aucun DDL ad hoc ici."""
    if engine.dialect.name == "postgresql" and not settings.DEBUG:
        _assert_migrations_current()
    else:
        Base.metadata.create_all(bind=engine)
    _run_data_backfills()


_prepare_schema()


def _reconcile_orphans_at_boot():
    """R5 — au démarrage, rembourse et rouvre les runs laissés 'analyzing'/
    'generating' par un crash process. Ne bloque jamais le démarrage."""
    try:
        from database import SessionLocal
        from services.run_reconciliation import reconcile_orphan_runs
        db = SessionLocal()
        try:
            reconcile_orphan_runs(db)
        finally:
            db.close()
    except Exception as exc:
        logger.warning("Réconciliation des runs orphelins ignorée: %s", exc)


_reconcile_orphans_at_boot()

# ── Rate limiter ─────────────────────────────────────────────────────────────
# Limiter PARTAGÉ (S1.2) : clé par org (non spoofable), stockage Redis en prod
# (cross-worker), et SlowAPIMiddleware installé plus bas — sans lui les limites
# globales ne s'appliquent JAMAIS (l'ancien default_limits était mort).
from services.rate_limit import limiter

app = FastAPI(
    title="SaaS AO BTP API",
    description="API for automating BTP tender responses",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
# Sans ce middleware, `default_limits` ne s'applique à aucune route (S1.2).
app.add_middleware(SlowAPIMiddleware)


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
                        # 0→25 : échelle du pipeline_tracker « uploading »
                        "progress": round(min(received / total, 1.0) * 25, 1),
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
@limiter.exempt  # sonde LB : jamais throttlée (S1.2)
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
