"""nginx : quand l'API ne répond pas (arrêtée, en redémarrage, délai dépassé), `/api/` rend une réponse en français.

Sans réglage, nginx répond lui-même « 502 Bad Gateway » ou « 504 Gateway Time-out » en page HTML anglaise. Le front
(`lib/erreurs.ts`) affiche la phrase `detail` d'un 503 telle quelle, et la file des préchargements se met en pause
sur un 503 (`services/sources.ts`) : nginx rend donc un 503 JSON avec une phrase calme et un `Retry-After`.
Seules les erreurs produites par nginx sont remplacées : les réponses de l'API, 503 compris, passent telles quelles
(pas de `proxy_intercept_errors`).
"""
import json
import re
from pathlib import Path

DEPLOY = Path(__file__).resolve().parents[2] / "deploy/nginx"
CONF = (DEPLOY / "synorix.conf").read_text(encoding="utf-8")
PROXY = (DEPLOY / "synorix-proxy.conf").read_text(encoding="utf-8")


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


def test_les_erreurs_de_nginx_vers_l_api_passent_par_une_reponse_en_francais():
    proxy = _sans_commentaires(PROXY)
    assert re.search(r"^\s*error_page\s+502\s+503\s+504\s+=\s*@api_indisponible\s*;", proxy, re.M), proxy
    assert "proxy_intercept_errors on" not in proxy, "les réponses de l'API elle-même ne doivent pas être remplacées"


def test_la_reponse_est_un_503_json_avec_retry_after_et_jamais_en_cache():
    conf = _sans_commentaires(CONF)
    bloc = _bloc(conf, "location @api_indisponible")
    m = re.search(r"return\s+503\s+'([^']+)'\s*;", bloc)
    assert m, bloc
    corps = json.loads(m.group(1))
    assert set(corps) == {"detail"}
    phrase = corps["detail"]
    assert phrase.startswith("Synorix") and phrase.endswith(".") and "!" not in phrase
    for mot in ("manquant", "incomplet", "absent", "error", "gateway"):
        assert mot not in phrase.lower()
    assert re.search(r"default_type\s+application/json\s*;", bloc)
    assert re.search(r'add_header\s+Retry-After\s+"?\d+"?\s+always\s*;', bloc)
    assert re.search(r'add_header\s+Cache-Control\s+"no-store"\s+always\s*;', bloc)


def test_chaque_location_de_l_api_inclut_le_mandataire():
    conf = _sans_commentaires(CONF)
    for ouverture in ("location ~ ^/api/projects/[^/]+/documents$", "location /api/"):
        assert "synorix-proxy.conf" in _bloc(conf, ouverture), ouverture
