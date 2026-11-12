"""nginx, fichiers signés (REVUE-FRONT).

- P2-5 : un fichier servi par X-Accel-Redirect (location interne /_fichiers_internes/) ne garde de la réponse de l'API
  que Content-Type, Content-Disposition et quelques en-têtes de cache (documentation de nginx, module
  ngx_http_proxy_module, X-Accel-Redirect) : la CSP et X-Frame-Options de l'API disparaissaient. Ils sont posés dans
  la location interne.
- P2-6 : /api/files/sign?path=… et /api/files/view/<uuid>-<nom d'origine>?org=…&sig=… entraient tels quels dans
  access_log (nom de fichier, signature valable 15 minutes). Le journal du site écrit ces adresses sans leur suite.
"""
import re
from pathlib import Path

CONF = (Path(__file__).resolve().parents[2] / "deploy/nginx/synorix.conf").read_text(encoding="utf-8")


def _sans_commentaires(texte: str) -> str:
    return re.sub(r"(?m)^\s*#.*$", "", texte)


def _bloc(texte: str, ouverture: str) -> str:
    debut = texte.index(ouverture)
    i = texte.index("{", debut)
    profondeur = 0
    for j in range(i, len(texte)):
        profondeur += {"{": 1, "}": -1}.get(texte[j], 0)
        if profondeur == 0:
            return texte[i + 1:j]
    raise AssertionError("bloc non fermé")


def test_fichiers_x_accel_gardent_les_en_tetes_de_securite():
    bloc = _sans_commentaires(_bloc(CONF, "location /_fichiers_internes/"))
    assert re.search(r"add_header Content-Security-Policy \"default-src 'none'; frame-ancestors 'none'\" always;", bloc)
    assert "add_header X-Frame-Options DENY always;" in bloc
    assert "add_header X-Content-Type-Options nosniff always;" in bloc
    assert "add_header Cross-Origin-Resource-Policy same-site always;" in bloc
