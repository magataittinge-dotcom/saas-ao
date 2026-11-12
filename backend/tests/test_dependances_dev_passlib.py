"""Audit données (P2) — passlib et bcrypt ne servent qu'au script de développement seed_test_user.py : ils sortent des
dépendances de production (moins de code installé sur le serveur, moins d'alertes à suivre) pour celles de développement."""
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]


def _paquets(fichier: str) -> set[str]:
    noms = set()
    for ligne in (RACINE / fichier).read_text(encoding="utf-8").splitlines():
        ligne = ligne.split("#", 1)[0].strip()
        if ligne and not ligne.startswith("-r"):
            noms.add(ligne.split("==")[0].split("[")[0].strip().lower())
    return noms


def test_passlib_et_bcrypt_hors_de_la_production():
    assert not {"passlib", "bcrypt"} & _paquets("requirements.txt")
    assert {"passlib", "bcrypt"} <= _paquets("requirements-dev.txt")


def test_aucun_code_de_l_appli_ne_les_importe():
    for chemin in RACINE.rglob("*.py"):
        rel = chemin.relative_to(RACINE).as_posix()
        if rel.startswith(("venv", "tests/", "scripts/")) or rel == "seed_test_user.py" or "/site-packages/" in rel:
            continue
        texte = chemin.read_text(encoding="utf-8", errors="ignore")
        assert "passlib" not in texte and "import bcrypt" not in texte, rel
