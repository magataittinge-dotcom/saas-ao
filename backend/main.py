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
    try:
        insp = inspect(engine)
        if insp.has_table("project_documents"):
            existing = {c["name"] for c in insp.get_columns("project_documents")}
            if "is_user_completed" not in existing:
                with engine.begin() as conn:
                    conn.execute(text(
                        "ALTER TABLE project_documents "
                        "ADD COLUMN is_user_completed BOOLEAN NOT NULL DEFAULT FALSE"
                    ))
                logger.info("Added column project_documents.is_user_completed")
    except Exception as e:
        logger.warning(f"Schema migration skipped: {e}")


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
