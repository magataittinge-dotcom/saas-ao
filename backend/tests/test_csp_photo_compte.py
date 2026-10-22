"""1.17 — La photo du compte (Clerk) s'affiche en bas de la barre latérale :
la CSP de production autorise les images servies par Clerk (img.clerk.com),
en image seulement — aucune autre directive n'est élargie."""


def _directive(csp: str, nom: str) -> list[str]:
    for directive in csp.split(";"):
        mots = directive.split()
        if mots and mots[0] == nom:
            return mots[1:]
    return []


def test_csp_de_production_autorise_les_photos_clerk(client, monkeypatch):
    import main

    # le middleware lit l'instance de réglages captée à l'import de main
    monkeypatch.setattr(main.settings, "DEBUG", False)
    csp = client.get("/api/health").headers["Content-Security-Policy"]

    assert "https://img.clerk.com" in _directive(csp, "img-src")
    assert "*" not in _directive(csp, "img-src")
    for nom in ("default-src", "script-src", "connect-src", "frame-src"):
        assert "https://img.clerk.com" not in _directive(csp, nom), nom
