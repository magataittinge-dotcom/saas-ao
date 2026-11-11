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
