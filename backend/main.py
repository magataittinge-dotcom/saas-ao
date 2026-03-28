from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from config import get_settings
from database import Base, engine

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
)
from routers.file_serve import router as file_serve_router

settings = get_settings()

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SaaS AO BTP API",
    description="API for automating BTP tender responses",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

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
app.include_router(file_serve_router, prefix="/api/files", tags=["files"])


@app.get("/api/health")
def health_check():
    return {"status": "ok", "version": "1.0.0"}


# Serve uploaded files
_uploads_dir = Path(__file__).parent / "uploads"
_uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")
