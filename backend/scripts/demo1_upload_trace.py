"""
DÉMO-1 — instrumentation reproductible : upload d'un gros ZIP réel + trace
de la progression (bus SSE + statut) avec timestamps.

JETABLE : script de validation pré-démo, pas du code produit.

Usage :
    cd backend && source venv/bin/activate
    python scripts/demo1_upload_trace.py \
        [--source uploads/projects/<id>/dce] [--max-gap 3.0]

Ce que fait le script :
  1. Reconstruit le ZIP DCE réel depuis un dossier de fichiers (Gueux par
     défaut) — taille et nombre de fichiers affichés.
  2. Environnement JETABLE : base sqlite scratch + dossier uploads temporaire
     (la base et les uploads de dev ne sont JAMAIS touchés).
  3. Upload via l'API réelle (TestClient in-process, même code serveur),
     collecte TOUS les événements du progress_bus (ce que voit le front en
     SSE) + polls processing-status toutes les 250 ms.
  4. Analyse : gel (aucun événement) > MAX_GAP pendant le traitement ;
     progression NON monotone par étape. Trace complète au terminal.

Sortie : code 0 si zéro gel > seuil et progression monotone, 1 sinon.
"""
import argparse
import io
import os
import sys
import tempfile
import threading
import time
import zipfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

# ── Environnement jetable AVANT tout import applicatif ────────────────────────
# Base POSTGRES jetable (synorix_demo1) dérivée du .env dev : sqlite+StaticPool
# ne supporte pas les threads d'extraction concurrents (faux échecs DB) —
# Postgres reproduit les conditions réelles.
_scratch = Path(tempfile.mkdtemp(prefix="demo1-"))


def _provision_scratch_postgres() -> str:
    from dotenv import dotenv_values
    dev_url = dotenv_values(BACKEND / ".env").get("DATABASE_URL", "")
    if not dev_url.startswith("postgresql"):
        raise SystemExit("DATABASE_URL Postgres introuvable dans backend/.env")
    base, _, _dbname = dev_url.rpartition("/")
    admin_url = f"{base}/postgres"
    scratch_url = f"{base}/synorix_demo1"
    import sqlalchemy
    admin = sqlalchemy.create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(sqlalchemy.text("DROP DATABASE IF EXISTS synorix_demo1 WITH (FORCE)"))
        conn.execute(sqlalchemy.text("CREATE DATABASE synorix_demo1"))
    admin.dispose()
    return scratch_url


os.environ["DATABASE_URL"] = _provision_scratch_postgres()
os.environ.setdefault("SECRET_KEY", "demo1-secret")
os.environ.setdefault("ANTHROPIC_API_KEY", "demo1-key")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")
os.environ.setdefault("CLERK_SECRET_KEY", "demo1")
os.environ.setdefault("CLERK_JWKS_URL", "https://example.dev/jwks.json")
os.environ.setdefault("DEBUG", "true")

import models  # noqa: E402,F401
from database import Base, SessionLocal, engine, get_db  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402
from models.organization import Organization  # noqa: E402
from models.user import User  # noqa: E402
from routers.auth import get_auth_user  # noqa: E402

import routers.projects as projects_mod  # noqa: E402
import services.file_storage as fs_mod  # noqa: E402
from services import progress_bus  # noqa: E402

DEFAULT_SOURCE = "uploads/projects/820a291b-8403-42cb-99ff-6a3626eb0264/dce"


def build_zip(source_dir: Path, dest: Path) -> tuple[int, int]:
    files = sorted(p for p in source_dir.iterdir() if p.is_file())
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            # Retire le préfixe uuid- des noms stockés pour un ZIP réaliste.
            name = f.name.split("-", 5)[-1] if len(f.name) > 37 else f.name
            zf.write(f, arcname=name)
    return len(files), dest.stat().st_size


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    parser.add_argument("--max-gap", type=float, default=3.0)
    args = parser.parse_args()

    source = (BACKEND / args.source).resolve()
    if not source.is_dir():
        print(f"ERREUR : dossier source introuvable : {source}")
        return 1

    # ── Setup jetable ─────────────────────────────────────────────────────────
    Base.metadata.create_all(bind=engine)
    uploads_tmp = _scratch / "uploads"
    uploads_tmp.mkdir()
    projects_mod.UPLOADS_ROOT = uploads_tmp
    fs_mod.UPLOADS_ROOT = uploads_tmp
    projects_mod.limiter.enabled = False

    db = SessionLocal()
    db.add(Organization(id="demo1-org", name="DEMO1"))
    user = User(id="demo1-user", email="demo1@synorix.fr", name="Demo",
                organization_id="demo1-org")
    db.add(user)
    db.commit()

    def _override_db():
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_auth_user] = lambda: user
    client = TestClient(app)

    # ── ZIP réel ──────────────────────────────────────────────────────────────
    zip_path = _scratch / "DCE_Gueux.zip"
    t0 = time.monotonic()
    n_files, zip_size = build_zip(source, zip_path)
    print(f"[ZIP] {n_files} fichiers → {zip_size / 1e6:.0f} Mo "
          f"(construit en {time.monotonic() - t0:.1f}s) depuis {source.name}/")

    pid = client.post("/api/projects", json={"name": "DEMO1 Gueux"}).json()["id"]

    # ── Collecte des événements ───────────────────────────────────────────────
    events: list[tuple[float, str, str]] = []  # (t, source, description)
    events_lock = threading.Lock()
    stop = threading.Event()
    start_ts = time.monotonic()

    def record(source: str, description: str) -> None:
        with events_lock:
            events.append((time.monotonic() - start_ts, source, description))

    bus_q = progress_bus.subscribe(pid)

    def drain_bus() -> None:
        # Format du bus : {"type", "data": snapshot pipeline_tracker, "ts"}
        while not stop.is_set():
            try:
                ev = bus_q.get(timeout=0.2)
            except Exception:
                continue
            data = ev.get("data") or {}
            record("SSE", f"{ev.get('type')} step={data.get('current_step')} "
                          f"pct={data.get('global_pct')} {data.get('detail', '')}")

    def poll_status() -> None:
        poll_client = TestClient(app)
        last = None
        while not stop.is_set():
            try:
                st = poll_client.get(f"/api/projects/{pid}/processing-status").json()
            except Exception:
                time.sleep(0.25)
                continue
            key = (st.get("status") or st.get("current_step"),
                   st.get("progress") if st.get("progress") is not None else st.get("global_pct"),
                   st.get("detail"))
            if key != last:
                record("POLL", str(key))
                last = key
            time.sleep(0.25)

    threading.Thread(target=drain_bus, daemon=True).start()
    poller = threading.Thread(target=poll_status, daemon=True)
    poller.start()

    # ── Upload (l'endpoint traite le ZIP puis lance l'extraction en thread) ──
    record("MAIN", "POST /documents (upload démarré)")
    with open(zip_path, "rb") as fh:
        resp = client.post(
            f"/api/projects/{pid}/documents",
            files={"file": ("DCE_Gueux.zip", fh, "application/zip")},
        )
    record("MAIN", f"upload terminé HTTP {resp.status_code} "
                   f"({resp.json().get('extracted_count', '?')} docs extraits)")
    if resp.status_code != 200:
        print(resp.text)
        return 1

    # Attendre la fin de l'extraction de texte (thread synorix-extract).
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        st = client.get(f"/api/projects/{pid}/processing-status").json()
        if st.get("status") in ("ready", "error") and not any(
            t.name.startswith("synorix-") and t.is_alive() for t in threading.enumerate()
        ):
            record("MAIN", f"processing final: {st.get('status')}")
            break
        time.sleep(0.25)
    stop.set()
    poller.join(timeout=2)

    # ── Trace + analyse ───────────────────────────────────────────────────────
    print(f"\n{'t (s)':>8}  {'src':4}  événement")
    print("-" * 100)
    gaps: list[tuple[float, float, str]] = []
    prev_t = 0.0
    for t, source, description in events:
        gap = t - prev_t
        marker = f"  ⟵ GEL {gap:.1f}s" if gap > args.max_gap else ""
        print(f"{t:8.2f}  {source:4}  {description[:80]}{marker}")
        if gap > args.max_gap:
            gaps.append((prev_t, t, description[:60]))
        prev_t = t

    # Monotonie de la progression (par étape SSE)
    non_monotone = []
    last_pct: dict[str, float] = {}
    for t, source, description in events:
        if source != "SSE":
            continue
        import re as _re
        m = _re.search(r"pct=([\d.]+)", description)
        step_m = _re.search(r"step=(\w+)", description)
        if m and step_m:
            step, pct = step_m.group(1), float(m.group(1))
            if step in last_pct and pct < last_pct[step] - 0.001:
                non_monotone.append((t, step, last_pct[step], pct))
            last_pct[step] = pct

    print("\n── VERDICT " + "─" * 60)
    print(f"Événements : {len(events)} sur {prev_t:.1f}s")
    if gaps:
        print(f"✗ {len(gaps)} gel(s) > {args.max_gap}s :")
        for start, end, around in gaps:
            print(f"   {start:.1f}s → {end:.1f}s ({end - start:.1f}s) avant : {around}")
    else:
        print(f"✓ zéro gel > {args.max_gap}s")
    if non_monotone:
        print(f"✗ progression non monotone : {non_monotone[:5]}")
    else:
        print("✓ progression monotone par étape")

    return 1 if (gaps or non_monotone) else 0


if __name__ == "__main__":
    sys.exit(main())
