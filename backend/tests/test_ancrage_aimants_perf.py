"""Bloc 2 — les aimants se calculent en temps linéaire, même sur un texte piégé.

Revue de sécurité : la regex des lignes de sommaire, appliquée par .search() à
chaque ligne, revenait en arrière sur toute une suite de points qui n'est pas
en fin de ligne (temps quadratique). `re` garde le GIL et l'API tourne dans un
seul processus : une ligne d'un million de points gelait toute l'API. Et les
lignes autour de chaque candidat étaient réanalysées (candidats × page).

Le calcul se fait dans un sous-processus avec un délai de garde : un `re`
bloqué ne rend pas la main à un signal, seul un sous-processus tué protège la
suite. Textes inventés.

Robuste à la charge (RESTES-2, point 8) : chaque temps est le meilleur de trois
essais, et le plafond suit la vitesse du moment de la machine, mesurée par une
opération témoin linéaire (un million de tours de boucle Python, meilleur de
trois) : plafond = max(plafond d'origine, N × témoin). Une machine chargée
ralentit le témoin comme le calcul ; un retour du temps quadratique (des
secondes, voire des minutes, sur un million de points) dépasse toujours.
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
def meilleur_de_trois(f):
    meilleur = None
    for _ in range(3):
        t0 = time.perf_counter()
        resultat = f()
        duree = time.perf_counter() - t0
        meilleur = duree if meilleur is None else min(meilleur, duree)
    return round(meilleur, 4), resultat
# Témoin : un travail linéaire fixe en Python pur, pour lire la vitesse du moment de la machine.
temps = {"temoin": meilleur_de_trois(lambda: sum(1 for c in "x" * 1_000_000 if c == "x"))[0]}
for nom, texte in textes.items():
    # La normalisation du document (linéaire, faite avant ce correctif, partagée
    # par tout l'ancrage) est hors chronomètre.
    ea._doc_index(texte)
    # 1. Ancrage complet (phrases, aimants, index) : borne large, sans temps quadratique.
    def ancrer():
        ea._AIMANTS_CACHE.clear()           # chaque essai refait tout le calcul
        return (ea.anchor_excerpt(phrase, texte),
                ea.anchor_excerpt("planning détaillé fourni par le titulaire pour les travaux", texte))
    temps["ancrage " + nom], (exact, recupere) = meilleur_de_trois(ancrer)
    assert exact == phrase and recupere and phrase in recupere, (nom, exact, recupere)
    # 2. Calcul des aimants, la partie qui était quadratique : lignes classées, puis
    #    chaque phrase de la pièce testée (tous les candidats).
    def aimants():
        ea._AIMANTS_CACHE.clear()
        return [ea._est_aimant(texte, a, b, False) for a, b, _t in ea._unites(texte)]
    temps["aimants " + nom], drapeaux = meilleur_de_trois(aimants)
    assert not drapeaux[-1]          # la phrase n'est pas un aimant
print(json.dumps(temps))
"""


# Plafonds en multiples du témoin. Au repos (12/11, 16 cœurs) : témoin 0,019 s, aimants du sommaire 0,107 s (5,7 témoins),
# ancrage du sommaire 0,053 s : les plafonds d'origine (0,5 s et 2 s) s'appliquent. Machine chargée : le plafond suit.
FACTEUR_AIMANTS = 20
FACTEUR_ANCRAGE = 80


def test_aimants_d_un_texte_piege_en_moins_d_une_demi_seconde():
    try:
        r = subprocess.run([sys.executable, "-c", ENFANT, str(BACKEND)], capture_output=True,
                           text=True, timeout=60)
    except subprocess.TimeoutExpired:
        raise AssertionError("calcul des aimants bloqué plus de 60 s (temps quadratique)")
    assert r.returncode == 0, r.stderr[-2000:]
    temps = json.loads(r.stdout.strip().splitlines()[-1])
    plafond_aimants = max(0.5, FACTEUR_AIMANTS * temps["temoin"])
    plafond_ancrage = max(2.0, FACTEUR_ANCRAGE * temps["temoin"])
    assert all(t < plafond_aimants for nom, t in temps.items() if nom.startswith("aimants")), (plafond_aimants, temps)
    assert all(t < plafond_ancrage for nom, t in temps.items() if nom.startswith("ancrage")), (plafond_ancrage, temps)
