"""POST /api/csp-rapport — rapports de la CSP en observation.

Publique mais bornée : 204, 413 au-delà de 8 Ko, 415 hors des deux types de rapport, 429 au-delà
du débit par IP ; le journal ne garde que la directive et l'origine bloquée (schéma + hôte)."""
import json
import logging

import pytest

from routers import csp_rapport
from services.rate_limit import limiter

LEGACY = {"csp-report": {
    "document-uri": "https://app.synorix.test/projets/abc-secret/memoire?token=zzz",
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    "blocked-uri": "https://cdn.exemple.test/chemin/prive/script.js?cle=SECRET123#frag",
    "original-policy": "default-src 'self'",
}}
MODERNE = [{
    "type": "csp-violation",
    "url": "https://app.synorix.test/projets/abc-secret",
    "body": {"effectiveDirective": "img-src", "blockedURL": "https://img.autre.test/a/b.png?u=jean.dupont",
             "documentURL": "https://app.synorix.test/x"},
}, {"type": "deprecation", "body": {"id": "x"}}]


@pytest.fixture(autouse=True)
def _compteurs_a_zero():
    csp_rapport._compteurs.clear()
    yield
    csp_rapport._compteurs.clear()


@pytest.fixture
def debit_actif():
    prev = limiter.enabled
    limiter.enabled = True
    try:
        limiter.reset()
    except Exception:
        pass
    yield
    limiter.enabled = prev
    try:
        limiter.reset()
    except Exception:
        pass


def _post(client, corps, type_contenu="application/csp-report"):
    return client.post("/api/csp-rapport", content=corps if isinstance(corps, bytes) else json.dumps(corps),
                       headers={"content-type": type_contenu})


def test_rapport_classique_204_sans_authentification(client):
    from main import app
    from fastapi.testclient import TestClient
    # Sans aucun jeton ni surcharge d'authentification : la route est publique.
    r = TestClient(app).post("/api/csp-rapport", content=json.dumps(LEGACY),
                             headers={"content-type": "application/csp-report"})
    assert r.status_code == 204 and r.content == b""


def test_rapport_moderne_reports_json_204(client):
    r = _post(client, MODERNE, "application/reports+json")
    assert r.status_code == 204
    assert csp_rapport.compteurs_csp() == {"img-src": 1}       # seul le rapport csp-violation compte


def test_content_type_avec_charset_accepte(client):
    assert _post(client, LEGACY, "application/csp-report; charset=utf-8").status_code == 204


@pytest.mark.parametrize("type_contenu", ["application/json", "text/plain", "multipart/form-data"])
def test_autre_type_de_contenu_415(client, type_contenu):
    assert _post(client, LEGACY, type_contenu).status_code == 415
    assert csp_rapport.compteurs_csp() == {}


def test_corps_illisible_ou_incomplet_400(client):
    assert _post(client, b"pas du json").status_code == 400
    assert _post(client, {"autre": 1}).status_code == 400
    assert _post(client, [1, 2], "application/reports+json").status_code == 400
    assert _post(client, {"x": 1}, "application/reports+json").status_code == 400


def test_corps_au_dela_du_plafond_413_par_content_length(client):
    gros = json.dumps({"csp-report": {"blocked-uri": "x" * (csp_rapport.MAX_CORPS_OCTETS + 10)}})
    assert _post(client, gros).status_code == 413
    assert csp_rapport.compteurs_csp() == {}


def test_corps_au_dela_du_plafond_413_en_flux_sans_content_length(client):
    """Sans Content-Length (envoi par morceaux) : la lecture s'arrête au dépassement."""
    lus = []

    def morceaux():
        for _ in range(100):                  # 100 x 1 Ko ; l'arrêt doit venir bien avant la fin
            lus.append(1)
            yield b"x" * 1024
    r = client.post("/api/csp-rapport", content=morceaux(),
                    headers={"content-type": "application/csp-report"})
    assert r.status_code == 413


def test_corps_juste_sous_le_plafond_passe(client):
    corps = json.dumps({"csp-report": {"violated-directive": "img-src", "blocked-uri": "https://a.test/",
                                       "pad": "x" * 7000}})
    assert len(corps) < csp_rapport.MAX_CORPS_OCTETS
    assert _post(client, corps.encode()).status_code == 204


def test_429_au_dela_du_debit_par_ip(client, debit_actif):
    codes = [_post(client, LEGACY).status_code for _ in range(65)]
    assert codes[:60] == [204] * 60
    assert 429 in codes[60:]


def test_journal_sans_chemin_ni_parametre_ni_page(client, caplog):
    with caplog.at_level(logging.DEBUG):
        assert _post(client, LEGACY).status_code == 204
        assert _post(client, MODERNE, "application/reports+json").status_code == 204
    texte = " ".join(r.getMessage() for r in caplog.records if "csp" in r.name.lower() or "CSP" in r.getMessage())
    assert "directive=script-src-elem" in texte
    assert "origine=https://cdn.exemple.test" in texte
    assert "origine=https://img.autre.test" in texte
    for interdit in ("chemin", "prive", "script.js", "SECRET123", "frag", "cle=", "abc-secret", "token",
                     "jean.dupont", "/a/b.png", "projets", "memoire", "?"):
        assert interdit not in texte, interdit
    # rien d'autre que ces deux lignes de CSP ne doit porter l'URL complète
    tout = " ".join(r.getMessage() for r in caplog.records)
    assert "SECRET123" not in tout and "abc-secret" not in tout


def test_compteur_par_directive(client):
    for _ in range(3):
        _post(client, LEGACY)
    _post(client, MODERNE, "application/reports+json")
    assert csp_rapport.compteurs_csp() == {"script-src-elem": 3, "img-src": 1}


@pytest.mark.parametrize("directive", ["script-src\nINJECTION", "x" * 80, "Script SRC", "'; drop", ""])
def test_directive_inventee_ne_passe_pas_telle_quelle(client, caplog, directive):
    corps = {"csp-report": {"violated-directive": directive, "blocked-uri": "https://a.test/p"}}
    with caplog.at_level(logging.INFO):
        assert _post(client, corps).status_code == 204
    texte = "\n".join(r.getMessage() for r in caplog.records)
    assert "INJECTION" not in texte and "drop" not in texte
    assert "\n" not in "".join(r.getMessage() for r in caplog.records if "CSP" in r.getMessage())


@pytest.mark.parametrize("blocked,attendu", [
    ("inline", "inline"), ("eval", "eval"), ("data:image/png;base64,AAAA", "data"),
    ("blob:https://app.test/uuid-1234", "blob"), ("", "inconnue"),
    ("https://CDN.Exemple.test:8443/p?q=1", "https://cdn.exemple.test"),
    ("https://a b/\nfaux", "autre"), ("javascript:alert(1)", "autre"),
])
def test_origine_schema_et_hote_seulement(blocked, attendu):
    assert csp_rapport.origine_sure(blocked) == attendu


def test_au_plus_64_directives_suivies():
    for i in range(80):
        csp_rapport.compter("dir-" + "".join(chr(97 + int(c)) for c in str(i)))
    suivies = csp_rapport.compteurs_csp()
    assert len(suivies) == csp_rapport._MAX_DIRECTIVES_SUIVIES + 1      # 64 + « autre »
    assert suivies["autre"] == 80 - csp_rapport._MAX_DIRECTIVES_SUIVIES
