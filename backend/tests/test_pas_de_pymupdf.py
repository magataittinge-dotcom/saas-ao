"""T11 — PyMuPDF (AGPL) est retiré : aucun fichier de backend/ ne l'importe et
requirements.txt ne le nomme plus. La garde lit le code et les fichiers de
dépendances ; elle ne dépend pas de ce qui est installé dans le venv.

Hors périmètre : le venv, node_modules, et le banc d'essai des lecteurs PDF
(scripts/banc_*.py et requirements-banc-pdf.txt : jamais en production)."""
import ast
import re
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
_NOMS = ("fitz", "pymupdf")
_EXCLUS_DOSSIERS = {"venv", ".venv", "node_modules", "__pycache__", "uploads"}


def _est_banc(chemin: Path) -> bool:
    return chemin.name.startswith("banc_") or "banc" in chemin.stem and chemin.suffix == ".txt"


def _imports_pymupdf(source: str) -> list[int]:
    """Lignes qui importent fitz / pymupdf : `import`, `from … import`, `import_module("…")`,
    `__import__("…")`, à n'importe quel niveau (dans une fonction aussi)."""
    lignes = []
    for n in ast.walk(ast.parse(source)):
        if isinstance(n, ast.Import):
            noms = [a.name for a in n.names]
        elif isinstance(n, ast.ImportFrom):
            noms = [n.module or ""]
        elif isinstance(n, ast.Call):
            f = n.func
            appel = f.attr if isinstance(f, ast.Attribute) else getattr(f, "id", "")
            premier = n.args[0] if n.args else None
            ok = appel in ("import_module", "__import__") and isinstance(premier, ast.Constant) \
                and isinstance(premier.value, str)
            noms = [premier.value] if ok else []
        else:
            continue
        if any(x.split(".")[0].lower() in _NOMS for x in noms):
            lignes.append(n.lineno)
    return lignes


def _fichiers_python() -> list[Path]:
    return [p for p in RACINE.rglob("*.py")
            if not (_EXCLUS_DOSSIERS & set(p.relative_to(RACINE).parts)) and not _est_banc(p)]


def test_aucun_fichier_de_backend_n_importe_pymupdf():
    fautifs = []
    for p in _fichiers_python():
        for ligne in _imports_pymupdf(p.read_text(encoding="utf-8")):
            fautifs.append(f"{p.relative_to(RACINE).as_posix()}:{ligne}")
    assert fautifs == [], f"PyMuPDF (AGPL) importé : {fautifs}"


def test_les_requirements_ne_nomment_pas_pymupdf():
    fautifs = []
    for p in sorted(RACINE.glob("requirements*.txt")):
        if _est_banc(p):
            continue
        for i, brut in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            ligne = brut.split("#", 1)[0].strip().lower()   # un commentaire peut en parler
            if re.match(r"(?:pymupdf|fitz)(?![a-z0-9])", ligne):
                fautifs.append(f"{p.name}:{i}")
    assert fautifs == [], f"PyMuPDF (AGPL) dans les dépendances : {fautifs}"


def test_la_garde_voit_les_formes_d_import():
    """La garde n'est pas vide : chaque forme d'import est reconnue."""
    for source in (
        "import fitz", "import pymupdf as m", "from fitz import Rect", "import fitz.utils",
        "def f():\n    import fitz\n", "import importlib\nimportlib.import_module('fitz')",
        "__import__('pymupdf')",
    ):
        assert _imports_pymupdf(source), source
    assert _imports_pymupdf("import pypdfium2\nx = 'fitz'\n# import fitz") == []


def test_le_banc_est_hors_de_la_garde():
    assert _est_banc(RACINE / "scripts" / "banc_ancrage.py")
    assert _est_banc(RACINE / "requirements-banc-pdf.txt")
    assert not _est_banc(RACINE / "requirements.txt")
