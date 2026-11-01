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


def test_clips_et_posters_du_visage_un_an_de_cache():
    """Les clips (mp4, webm) et posters (webp) du visage de « Mon entreprise » : un an, immuables, comme assets/."""
    conf = _sans_commentaires(CONF)
    bloc = _bloc(conf, 'location ~ "^/visage/(?:visage-[1-4]\\.(?:mp4|webm)|poster(?:-ferme)?\\.webp)$"')
    assert 'add_header Cache-Control "public, max-age=31536000, immutable";' in bloc
    assert "synorix-entetes-statiques.conf" in bloc and "try_files $uri =404;" in bloc
    assert "always" not in re.search(r'Cache-Control[^;]*;', bloc).group(0), "une 404 ne doit pas être mise en cache un an"
    assert "gzip" not in bloc, "les vidéos et les webp sont déjà compressés"


def test_points_bin_n_est_pas_capte_par_le_location_des_clips():
    """`location =` (exact) l'emporte sur l'expression régulière, et l'expression ne couvre pas .bin."""
    conf = _sans_commentaires(CONF)
    assert conf.index("location = /visage/points.bin") >= 0
    motif = re.search(r'location ~ "(\^/visage/[^"]+)"', conf).group(1)
    assert re.match(motif, "/visage/visage-1.mp4") and re.match(motif, "/visage/visage-4.webm")
    assert re.match(motif, "/visage/poster.webp") and re.match(motif, "/visage/poster-ferme.webp")
    assert not re.match(motif, "/visage/points.bin")
    assert not re.match(motif, "/visage/sous/dossier.mp4")
    assert not re.match(motif, "/visage/tete-ouverte-poster.webp"), "les posters du Compagnon gardent leur cache d'avant"


def test_le_cerveau_n_est_plus_servi_location_entreprise_retire():
    """frontend/public/entreprise/ n'existe plus (le visage remplace le cerveau) : plus de location dédié."""
    assert "location /entreprise/" not in _sans_commentaires(CONF)
    assert not (Path(__file__).resolve().parents[2] / "frontend/public/entreprise").exists()
