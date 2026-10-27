"""Domaine de production : synorix.tech (décision de Mohamed, 27/10/2026 : synorix.fr n'a jamais été acheté).

- aucun fichier suivi par git ne nomme synorix.fr ;
- la CSP du front (nginx) couvre Clerk de production (clerk.synorix.tech) ET Clerk de développement
  (*.clerk.accounts.dev), tant que l'instance de production n'existe pas (choix au bloc 12) ;
- le site nginx sert synorix.tech, www redirigé vers le domaine nu.
"""
import re
import subprocess
from pathlib import Path

import pytest

RACINE = Path(__file__).resolve().parents[2]


def _fichiers_suivis() -> list[Path]:
    try:
        sortie = subprocess.run(["git", "-C", str(RACINE), "ls-files", "-z"], capture_output=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        pytest.skip("dépôt git introuvable")
    return [RACINE / p for p in sortie.decode().split("\0") if p]


def test_aucun_fichier_suivi_ne_nomme_synorix_fr():
    motif = re.compile(rb"synorix\.fr\b")
    trouves = []
    for f in _fichiers_suivis():
        if f.name == "test_domaine_prod.py" or f.suffix in {".png", ".webp", ".webm", ".ttf", ".woff2", ".pdf", ".docx"}:
            continue
        try:
            if motif.search(f.read_bytes()):
                trouves.append(str(f.relative_to(RACINE)))
        except OSError:
            continue
    assert trouves == []


def _csp_front() -> str:
    texte = (RACINE / "deploy/nginx/synorix-entetes.conf").read_text(encoding="utf-8")
    m = re.search(r'Content-Security-Policy-Report-Only "([^"]+)"', texte)
    assert m, "CSP en observation absente"
    return m.group(1)


def _directive(csp: str, nom: str) -> list[str]:
    for d in csp.split(";"):
        mots = d.split()
        if mots and mots[0] == nom:
            return mots[1:]
    return []


@pytest.mark.parametrize("directive", ["script-src", "connect-src"])
def test_csp_du_front_couvre_clerk_prod_et_dev(directive):
    origines = _directive(_csp_front(), directive)
    assert "https://clerk.synorix.tech" in origines
    assert "https://*.clerk.accounts.dev" in origines


def test_site_nginx_sur_synorix_tech():
    site = (RACINE / "deploy/nginx/synorix.conf").read_text(encoding="utf-8")
    assert "server_name synorix.tech www.synorix.tech;" in site
    assert "return 301 https://synorix.tech$request_uri;" in site
    assert "/etc/letsencrypt/live/synorix.tech/fullchain.pem" in site
