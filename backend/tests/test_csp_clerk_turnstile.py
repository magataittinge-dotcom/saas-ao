"""CSP du front et protection contre les robots de Clerk (case « Vérifiez que vous êtes humain », Cloudflare Turnstile).

Référence : documentation publique de Clerk, « Fixing Content Security Policy (CSP) errors »
(https://clerk.com/docs/security/clerk-csp, lue le 11/11/2026) :
- script-src : l'hôte de l'API Frontend, `https://challenges.cloudflare.com`, `https://*.protect.clerk.com` ;
- connect-src : l'hôte de l'API Frontend et `https://*.protect.clerk.com:*` — « The trailing `:*` is required: Clerk's
  abuse and fraud protection hosts are served on ports other than 443 » ;
- frame-src : `https://challenges.cloudflare.com`, `https://*.protect.clerk.com` ;
- img-src `https://img.clerk.com` ; worker-src `'self'` et `blob:` ; style-src `'unsafe-inline'`.
"""
import re
from pathlib import Path

import pytest

RACINE = Path(__file__).resolve().parents[2]


def _csp_front() -> str:
    texte = (RACINE / "deploy/nginx/synorix-entetes.conf").read_text(encoding="utf-8")
    m = re.search(r'Content-Security-Policy(?:-Report-Only)? "([^"]+)"', texte)
    assert m, "CSP du front absente"
    return m.group(1)


def _directive(nom: str) -> list[str]:
    for d in _csp_front().split(";"):
        mots = d.split()
        if mots and mots[0] == nom:
            return mots[1:]
    return []


@pytest.mark.parametrize("directive,origine", [
    ("script-src", "https://challenges.cloudflare.com"),
    ("script-src", "https://*.protect.clerk.com"),
    ("frame-src", "https://challenges.cloudflare.com"),
    ("frame-src", "https://*.protect.clerk.com"),
    ("connect-src", "https://*.protect.clerk.com:*"),
    ("img-src", "https://img.clerk.com"),
    ("worker-src", "'self'"),
    ("worker-src", "blob:"),
    ("style-src", "'unsafe-inline'"),
])
def test_la_csp_du_front_suit_la_documentation_de_clerk(directive, origine):
    assert origine in _directive(directive), f"{directive} sans {origine}"


def test_la_csp_du_front_est_bloquante_et_garde_ses_rapports():
    """P1-1 (REVUE-FRONT) : en observation, la CSP ne freinait aucune XSS. Elle bloque, et signale toujours."""
    texte = (RACINE / "deploy/nginx/synorix-entetes.conf").read_text(encoding="utf-8")
    actives = [l for l in texte.splitlines() if not l.lstrip().startswith("#")]
    bloquante = [l for l in actives if 'add_header Content-Security-Policy "' in l]
    assert len(bloquante) == 1, "une seule CSP bloquante active"
    assert "report-uri /api/csp-rapport" in bloquante[0]
    assert not [l for l in actives if "Content-Security-Policy-Report-Only" in l], "plus de CSP seulement en observation"
    for directive, attendu in [("object-src", "'none'"), ("base-uri", "'self'"), ("frame-ancestors", "'none'")]:
        assert _directive(directive) == [attendu], directive
    assert "'unsafe-eval'" not in _csp_front() and "'unsafe-inline'" not in _directive("script-src")
