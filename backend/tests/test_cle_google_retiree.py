"""Sprint Ozcan, lieu B — la clé Google Maps n'existe plus côté backend.

La carte du mémoire vient de l'IGN (sans clé). Seul le front garde
VITE_GOOGLE_MAPS_API_KEY pour l'aperçu de la page « Mon entreprise » : cette
image est chargée par le navigateur depuis la page servie par nginx (sans CSP du
backend), donc la CSP de l'API n'a plus besoin de maps.googleapis.com.
"""
from pathlib import Path

from config import Settings

RACINE = Path(__file__).resolve().parent.parent


def test_le_demarrage_ne_reclame_plus_la_cle(monkeypatch):
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    reglages = Settings(_env_file=None)
    assert not hasattr(reglages, "GOOGLE_MAPS_API_KEY")


def test_un_ancien_env_avec_la_cle_ne_casse_pas_le_demarrage(monkeypatch):
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "valeur-inventee")
    reglages = Settings(_env_file=None)          # extra='ignore' : la ligne est simplement ignorée
    assert not hasattr(reglages, "GOOGLE_MAPS_API_KEY")


def test_aucune_occurrence_google_maps_dans_le_backend():
    trouves = []
    for chemin in RACINE.rglob("*"):
        parties = set(chemin.relative_to(RACINE).parts)
        if (not chemin.is_file() or parties & {"tests", "venv", "__pycache__", "uploads", ".pytest_cache"}
                or chemin.suffix in {".png", ".jpg", ".ttf", ".otf", ".pyc", ".db", ".sqlite"}):
            continue
        try:
            texte = chemin.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if "GOOGLE_MAPS" in texte.upper().replace(" ", "_"):
            trouves.append(str(chemin.relative_to(RACINE)))
    assert trouves == []


def test_la_csp_de_l_api_n_autorise_plus_les_images_google_maps(client, monkeypatch):
    import main

    monkeypatch.setattr(main.settings, "DEBUG", False)
    csp = client.get("/api/health").headers["Content-Security-Policy"]
    images = next(d.split()[1:] for d in csp.split(";") if d.split()[:1] == ["img-src"])
    assert not any("maps.googleapis.com" in h or "maps.gstatic.com" in h for h in images)
    assert "https://img.clerk.com" in images       # la photo du compte reste servie
