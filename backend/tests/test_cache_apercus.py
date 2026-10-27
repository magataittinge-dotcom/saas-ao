"""Cache disque des aperçus (T-CACHE) : touché/raté, clés par contenu, éviction LRU, atomicité."""
import os
import re
import threading
import time

import pytest

from services import cache_apercus as ca
from services.cache_apercus import CacheApercus


@pytest.fixture
def fichier(tmp_path):
    chemin = tmp_path / "CCTP lot 05 — secret.pdf"
    chemin.write_bytes(b"%PDF contenu de la piece A")
    return chemin


@pytest.fixture
def cache(tmp_path):
    return CacheApercus(tmp_path / "cache", plafond_octets=10_000)


def test_rate_puis_touche(cache, fichier):
    appels = []

    def calculer():
        appels.append(1)
        return b"WEBP-1"

    a = cache.obtenir_ou_calculer(fichier, 3, (0.1, 0.2, 0.5, 0.6), 800, "passage", calculer)
    b = cache.obtenir_ou_calculer(fichier, 3, (0.1, 0.2, 0.5, 0.6), 800, "passage", calculer)
    assert a == b == b"WEBP-1"
    assert len(appels) == 1                      # le 2e appel vient du disque


@pytest.mark.parametrize("autre", [
    dict(page_index=4), dict(cadrage=(0.1, 0.2, 0.5, 0.7)), dict(cadrage=None),
    dict(largeur_px=801), dict(vue="page"),
])
def test_la_cle_depend_de_chaque_element(fichier, autre):
    base = dict(page_index=3, cadrage=(0.1, 0.2, 0.5, 0.6), largeur_px=800, vue="passage")
    empreinte = ca.empreinte_fichier(fichier)
    assert ca.cle_apercu(empreinte, **{**base, **autre}) != ca.cle_apercu(empreinte, **base)


def test_la_cle_depend_de_la_version_du_rendu(fichier, monkeypatch):
    e = ca.empreinte_fichier(fichier)
    avant = ca.cle_apercu(e, 0, None, 800, "page")
    monkeypatch.setattr(ca, "VERSION_RENDU", ca.VERSION_RENDU + 1)
    assert ca.cle_apercu(e, 0, None, 800, "page") != avant


def test_le_bruit_flottant_du_cadrage_ne_change_pas_la_cle(fichier):
    e = ca.empreinte_fichier(fichier)
    assert ca.cle_apercu(e, 0, (0.1 + 0.2, 0.5, 0.9, 0.95), 800, "p") == \
        ca.cle_apercu(e, 0, (0.3, 0.5, 0.9, 0.95), 800, "p")


def test_adresse_par_contenu_meme_fichier_ailleurs_meme_cle(cache, fichier, tmp_path):
    copie = tmp_path / "autre-dossier" / "x.pdf"
    copie.parent.mkdir()
    copie.write_bytes(fichier.read_bytes())
    os.utime(copie, (1, 1))                      # autre date, autre nom : même contenu
    assert cache.cle(fichier, 0, None, 800, "page") == cache.cle(copie, 0, None, 800, "page")


def test_un_fichier_modifie_change_de_cle(cache, fichier):
    avant = cache.cle(fichier, 0, None, 800, "page")
    ancien = fichier.stat().st_mtime_ns
    fichier.write_bytes(b"%PDF contenu de la piece B")       # même taille : seule la date change
    os.utime(fichier, ns=(ancien + 5_000_000_000, ancien + 5_000_000_000))
    assert cache.cle(fichier, 0, None, 800, "page") != avant


def test_empreinte_memoisee_pas_de_relecture(fichier, monkeypatch):
    lectures = []
    vrai = ca._hacher
    monkeypatch.setattr(ca, "_hacher", lambda c: lectures.append(c) or vrai(c))
    ca._memo.clear()
    premiere = ca.empreinte_fichier(fichier)
    assert [ca.empreinte_fichier(fichier) for _ in range(5)] == [premiere] * 5
    assert len(lectures) == 1
    time.sleep(0.01)
    fichier.write_bytes(b"autre contenu, autre taille")           # taille et date changent
    assert ca.empreinte_fichier(fichier) != premiere
    assert len(lectures) == 2


def test_aucune_donnee_du_dce_dans_les_noms(cache, fichier):
    cache.obtenir_ou_calculer(fichier, 0, None, 800, "page", lambda: b"x" * 100)
    noms = [p.relative_to(cache.dossier).parts for p in cache.dossier.rglob("*") if p.is_file()]
    assert len(noms) == 1
    sous, nom = noms[0]
    assert re.fullmatch(r"[0-9a-f]{2}", sous) and re.fullmatch(r"[0-9a-f]{64}\.webp", nom)
    assert "secret" not in str(cache.dossier) and "CCTP" not in nom


def test_eviction_lru_sous_le_plafond(cache):
    # plafond 10 000 o ; 5 entrées de 3 000 o. La plus ancienne lue récemment survit.
    cles = [f"{i:02x}" + "0" * 62 for i in range(5)]
    for i, cle in enumerate(cles[:3]):
        cache.ecrire(cle, bytes([i]) * 3000)
        os.utime(cache._chemin(cle), (1000 + i, 1000 + i))      # âges distincts et stables
    assert cache.lire(cles[0]) is not None                      # touche la plus ancienne : devient la récente
    cache.ecrire(cles[3], b"\x03" * 3000)                       # 12 000 o > 10 000 : éviction
    assert cache.taille_totale() <= 10_000 * 0.9
    assert cache.lire(cles[0]) is not None                      # touchée : gardée
    assert cache.lire(cles[1]) is None                          # la plus ancienne non touchée : partie
    assert cache.lire(cles[3]) is not None                      # la nouvelle : gardée


def test_le_total_ne_depasse_jamais_le_plafond_apres_ecritures(cache):
    for i in range(40):
        cache.ecrire(f"{i:02x}" + "a" * 62, b"z" * 1500)
    assert cache.taille_totale() <= cache.plafond


def test_une_entree_plus_grosse_que_le_plafond_n_est_pas_gardee(cache):
    assert cache.ecrire("ab" + "c" * 62, b"y" * 20_000) is False
    assert cache.taille_totale() == 0


def test_ecriture_concurrente_sans_fichier_tronque(tmp_path):
    cache = CacheApercus(tmp_path / "c", plafond_octets=50 * 1024 * 1024)
    cle = "cd" + "e" * 62
    contenu = b"RIFF" + os.urandom(300_000)
    fautes = []
    arret = threading.Event()

    def ecrivain():
        for _ in range(30):
            cache.ecrire(cle, contenu)

    def lecteur():
        while not arret.is_set():
            lu = cache.lire(cle)
            if lu is not None and lu != contenu:
                fautes.append(len(lu))

    lecteurs = [threading.Thread(target=lecteur) for _ in range(3)]
    ecrivains = [threading.Thread(target=ecrivain) for _ in range(6)]
    [t.start() for t in lecteurs + ecrivains]
    [t.join(60) for t in ecrivains]
    arret.set()
    [t.join(10) for t in lecteurs]
    assert fautes == []
    assert cache.lire(cle) == contenu
    assert [p.name for p in cache.dossier.rglob(".tmp-*")] == []        # aucun temporaire oublié


def test_une_ecriture_impossible_ne_fait_pas_echouer_l_apercu(tmp_path, fichier):
    bloque = tmp_path / "fichier-pas-dossier"
    bloque.write_text("x")
    cache = CacheApercus(bloque / "sous", plafond_octets=1000)
    assert cache.obtenir_ou_calculer(fichier, 0, None, 800, "page", lambda: b"ok") == b"ok"


def test_reglages_par_defaut_et_environnement(monkeypatch, tmp_path):
    monkeypatch.delenv("SYNORIX_CACHE_APERCUS_DIR", raising=False)
    monkeypatch.delenv("SYNORIX_CACHE_APERCUS_MO", raising=False)
    defaut = CacheApercus()
    assert defaut.dossier.parts[-3:] == ("backend", "cache", "apercus")
    assert defaut.plafond == ca.PLAFOND_MO_DEFAUT * 1024 * 1024 == 2 * 1024 ** 3
    monkeypatch.setenv("SYNORIX_CACHE_APERCUS_DIR", str(tmp_path / "ailleurs"))
    monkeypatch.setenv("SYNORIX_CACHE_APERCUS_MO", "64")
    regle = CacheApercus()
    assert regle.dossier == tmp_path / "ailleurs" and regle.plafond == 64 * 1024 * 1024


def test_le_dossier_du_cache_est_ignore_par_git():
    racine = ca._RACINE_BACKEND.parent
    assert "backend/cache/" in (racine / ".gitignore").read_text(encoding="utf-8").splitlines()
