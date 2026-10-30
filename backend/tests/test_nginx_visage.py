"""nginx : /visage/points.bin (24,6 ko, binaire « SXV1 » du Compagnon) est compressé à la volée, pour CE chemin seulement.

Mesuré : 24 642 octets bruts -> 14 718 en gzip niveau 9. Le précompresseur du build ne traite pas les .bin,
et `application/octet-stream` ne doit pas entrer dans le `gzip_types` global (il couvrirait les
téléchargements) : un `location` exact porte sa propre liste.
"""
import re
from pathlib import Path

CONF = (Path(__file__).resolve().parents[2] / "deploy/nginx/synorix.conf").read_text(encoding="utf-8")


def _sans_commentaires(texte: str) -> str:
    return re.sub(r"(?m)^\s*#.*$", "", texte)


def _bloc(texte: str, ouverture: str) -> str:
    """Contenu du bloc `ouverture { ... }` (accolades équilibrées)."""
    debut = texte.index(ouverture)
    i = texte.index("{", debut)
    profondeur = 0
    for j in range(i, len(texte)):
        profondeur += {"{": 1, "}": -1}.get(texte[j], 0)
        if profondeur == 0:
            return texte[i + 1:j]
    raise AssertionError("bloc non fermé")


def test_gzip_types_global_sans_octet_stream():
    conf = _sans_commentaires(CONF)
    globaux = re.findall(r"(?m)^    gzip_types ([^;]+);", conf)   # niveau `server` (indentation 4)
    assert len(globaux) == 1
    assert "application/octet-stream" not in globaux[0]


def test_points_bin_a_son_propre_location_compresse():
    conf = _sans_commentaires(CONF)
    bloc = _bloc(conf, "location = /visage/points.bin")
    assert re.search(r"\bgzip on;", bloc)
    types = re.search(r"gzip_types ([^;]+);", bloc)
    assert types and "application/octet-stream" in types.group(1).split()
    assert "try_files $uri =404;" in bloc
    assert "X-Content-Type-Options" in bloc or "synorix-entetes-statiques.conf" in bloc


def test_points_bin_reste_sans_cache_comme_avant():
    bloc = _bloc(_sans_commentaires(CONF), "location = /visage/points.bin")
    assert 'add_header Cache-Control "no-cache" always;' in bloc


def test_aucun_autre_location_ne_compresse_les_binaires():
    conf = _sans_commentaires(CONF)
    assert conf.count("application/octet-stream") == 1
