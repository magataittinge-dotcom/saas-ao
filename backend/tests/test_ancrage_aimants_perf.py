"""Bloc 2 — les aimants se calculent en temps linéaire, même sur un texte piégé.

Revue de sécurité : la regex des lignes de sommaire, appliquée par .search() à
chaque ligne, revenait en arrière sur toute une suite de points qui n'est pas
en fin de ligne (temps quadratique). `re` garde le GIL et l'API tourne dans un
seul processus : une ligne d'un million de points gelait toute l'API. Et les
lignes autour de chaque candidat étaient réanalysées (candidats × page).

Le calcul se fait dans un sous-processus avec un délai de garde : un `re`
bloqué ne rend pas la main à un signal, seul un sous-processus tué protège la
suite. Textes inventés.
"""
import json
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent

ENFANT = r"""
import json, sys, time
sys.path.insert(0, sys.argv[1])
import services.ai.excerpt_anchor as ea
phrase = "Le titulaire fournira le planning détaillé des travaux."
textes = {
    "points": "ARTICLE 1\n" + "." * 1_000_000 + " fin\n" + phrase + "\n",
    "sommaire": "\n".join(f"ARTICLE {i} – TITRE DU CHAPITRE {i} " + "." * 20 + f" {i}" for i in range(20_000))
                + "\n" + phrase + "\n",
}
temps = {}
for nom, texte in textes.items():
    # La normalisation du document (linéaire, faite avant ce correctif, partagée
    # par tout l'ancrage) est hors chronomètre.
    ea._doc_index(texte)
    # 1. Ancrage complet (phrases, aimants, index) : borne large, sans temps quadratique.
    t0 = time.perf_counter()
    exact = ea.anchor_excerpt(phrase, texte)
    recupere = ea.anchor_excerpt("planning détaillé fourni par le titulaire pour les travaux", texte)
    temps["ancrage " + nom] = round(time.perf_counter() - t0, 3)
    assert exact == phrase and recupere and phrase in recupere, (nom, exact, recupere)
    # 2. Calcul des aimants, la partie qui était quadratique : lignes classées, puis
    #    chaque phrase de la pièce testée (tous les candidats).
    ea._AIMANTS_CACHE.clear()
    t0 = time.perf_counter()
    drapeaux = [ea._est_aimant(texte, a, b, False) for a, b, _t in ea._unites(texte)]
    temps["aimants " + nom] = round(time.perf_counter() - t0, 3)
    assert not drapeaux[-1]          # la phrase n'est pas un aimant
print(json.dumps(temps))
"""


def test_aimants_d_un_texte_piege_en_moins_d_une_demi_seconde():
    try:
        r = subprocess.run([sys.executable, "-c", ENFANT, str(BACKEND)], capture_output=True,
                           text=True, timeout=60)
    except subprocess.TimeoutExpired:
        raise AssertionError("calcul des aimants bloqué plus de 60 s (temps quadratique)")
    assert r.returncode == 0, r.stderr[-2000:]
    temps = json.loads(r.stdout.strip().splitlines()[-1])
    assert all(t < 0.5 for nom, t in temps.items() if nom.startswith("aimants")), temps
    assert all(t < 2.0 for nom, t in temps.items() if nom.startswith("ancrage")), temps
