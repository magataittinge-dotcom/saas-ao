"""Mise en forme d'un extrait de contrat montré au client (étape Décider : trésorerie, pénalités, champs critiques).

Une seule règle, appliquée à la lecture (les AO déjà analysés en profitent) et seulement au texte d'affichage :
- un extrait ne se coupe jamais dans un mot ;
- il finit à la fin d'une phrase quand elle tient, sinon au dernier mot entier suivi de « … » ;
- il ne déborde pas sur le titre de l'article voisin (un titre numéroté en capitales, « 7.4 REPLIEMENT DES
  INSTALLATIONS », arrête l'extrait) ;
- s'il commence au milieu d'une phrase, il commence par « … ».

Rien ne change de ce qui est lu ni de ce qui est rangé : l'extrait exact reste à côté (`excerpt_exact`), la recherche
des pages et l'ancrage mot pour mot continuent de lire le texte exact. Les extraits sont des fenêtres de quelques
dizaines de mots autour du fait lu (rayon de 80 à 90 caractères de part et d'autre) : le fait est au milieu."""
from __future__ import annotations

import copy
import re
from typing import Any, Optional

LIMITE = 320                       # caractères montrés au plus
_FENETRE_MIN = 150                 # en dessous, le texte n'est pas une fenêtre coupée (un libellé, une phrase entière)
_DEBUT_SUR = 70                    # une fin de phrase avant ce rang est avant le fait (rayon des fenêtres : 80)

_MAJ = "A-ZÀ-ÖØ-Þ"
_MOT_MAJ = rf"[{_MAJ}][{_MAJ}'’]*(?![a-zà-ÿ])"
# « 7.4 REPLIEMENT DES INSTALLATIONS », « 4 RETENUE DE GARANTIE », « ARTICLE 5 - PÉNALITÉS DE RETARD »
_TITRE = re.compile(
    rf"(?<!\S)(?:ARTICLE\s+)?\d{{1,2}}(?:\.\d{{1,2}}){{0,3}}\.?\s*(?:[-–—:]\s*)?"
    rf"[{_MAJ}]{{3,}}[{_MAJ}'’]*(?![a-zà-ÿ])(?:\s+{_MOT_MAJ})+"
)
_POINTILLES = re.compile(r"(?:\s*[.…·]){4,}")          # points de conduite d'un sommaire
_FIN_DE_PHRASE = re.compile(rf"[.!?](?=\s+[{_MAJ}0-9«\"“(])")
_FINIT_PHRASE = re.compile(r"[.!?…»\"”)]$")


def _derniere_fin_de_phrase(texte: str, apres: int, avant: int) -> Optional[int]:
    """Position juste après le dernier « . », « ! » ou « ? » qui clôt une phrase, entre `apres` et `avant`."""
    fins = [m.end() for m in _FIN_DE_PHRASE.finditer(texte) if apres <= m.end() <= avant]
    if texte[:avant].rstrip().endswith((".", "!", "?")) and len(texte[:avant].rstrip()) >= apres:
        fins.append(len(texte[:avant].rstrip()))
    return max(fins) if fins else None


_MOTS_OUTILS = {"le", "la", "les", "l'", "l’", "de", "des", "du", "d'", "d’", "à", "au", "aux", "et", "ou", "un",
                "une", "en", "par", "pour", "sur", "que", "qui", "dans", "son", "sa", "ses", "leur", "leurs", "ce", "ces"}


def _sans_dernier_mot(texte: str) -> str:
    """Le texte jusqu'au dernier mot entier (le dernier mot d'une fenêtre est le plus souvent coupé), sans finir sur un
    mot-outil (« le titulaire peut solliciter le… » → « le titulaire peut solliciter… »)."""
    coupe = texte.rstrip().rsplit(" ", 1)
    if len(coupe) != 2:
        return texte
    reste = coupe[0].rstrip(" ,;:–—-")
    while " " in reste and reste.rsplit(" ", 1)[1].lower() in _MOTS_OUTILS:
        reste = reste.rsplit(" ", 1)[0].rstrip(" ,;:–—-")
    return reste


def extrait_lisible(texte: Optional[str], limite: int = LIMITE) -> Optional[str]:
    """L'extrait tel qu'il se lit à l'écran (voir la règle en tête du module). Un texte court et propre passe tel quel."""
    if texte is None:
        return None
    t = " ".join(_POINTILLES.sub(" ", str(texte)).split())
    if not t:
        return t
    fenetre = len(t) >= _FENETRE_MIN
    centre = len(t) // 2

    # 1. Le morceau entre deux titres d'article qui contient le fait (le milieu de la fenêtre).
    debut, fin, titre_en_tete = 0, len(t), None
    for m in _TITRE.finditer(t):
        if m.start() == 0 or m.start() <= centre:
            debut, titre_en_tete = m.start(), m
        else:
            fin = m.start()
            break
    if titre_en_tete is not None:
        corps = t[titre_en_tete.end():fin].strip()
        # le titre de l'article du fait ne se soude pas à sa première phrase ; il reste s'il n'y a rien d'autre
        debut = titre_en_tete.end() if len(re.findall(r"[A-Za-zÀ-ÿ]{2,}", corps)) >= 3 else titre_en_tete.start()
    morceau = t[debut:fin].strip()
    coupe_au_titre = fin < len(t)

    # 2. Le début : au milieu d'une phrase, on repart après la phrase précédente si elle finit avant le fait,
    #    sinon on retire le premier mot (souvent coupé) et l'extrait commence par « … ».
    prefixe = ""
    if debut == 0 and morceau and not (morceau[0].isupper() or morceau[0].isdigit() or morceau[0] in "«\"“(◼•-–"):
        fin_phrase = _derniere_fin_de_phrase(morceau, 1, min(_DEBUT_SUR, centre)) if fenetre else None
        if fin_phrase is not None and fin_phrase < len(morceau):
            morceau = morceau[fin_phrase:].lstrip()
        else:
            if fenetre and " " in morceau:
                morceau = morceau.split(" ", 1)[1].lstrip(" ,;:–—-")
            prefixe = "… "

    # 3. La fin : à la fin d'une phrase, sinon au dernier mot entier suivi de « … ».
    suffixe = ""
    if not _FINIT_PHRASE.search(morceau):
        if coupe_au_titre:
            morceau = morceau.rstrip(" ,;:–—-")
            suffixe = "…"
        elif fenetre:
            milieu = max(0, centre - (len(t) - len(morceau)))
            fin_phrase = _derniere_fin_de_phrase(morceau, milieu, len(morceau))
            if fin_phrase is not None:
                morceau = morceau[:fin_phrase]
            else:
                morceau = _sans_dernier_mot(morceau)
                suffixe = "…"

    # 4. La limite de longueur : fin de phrase si elle tient, sinon dernier mot entier.
    if len(prefixe) + len(morceau) + len(suffixe) > limite:
        place = limite - len(prefixe) - 1
        fin_phrase = _derniere_fin_de_phrase(morceau, place // 2, place)
        if fin_phrase is not None:
            morceau, suffixe = morceau[:fin_phrase], ""
        else:
            morceau, suffixe = _sans_dernier_mot(morceau[:place + 1]), "…"
    return f"{prefixe}{morceau}{suffixe}"


def extraits_lisibles(donnees: Any) -> Any:
    """Copie de `donnees` (réponse d'une route de Décider) où chaque source `{"excerpt": …}` porte l'extrait lisible ;
    l'extrait exact reste à côté (`excerpt_exact`). L'original n'est jamais modifié (il peut venir d'un cache)."""
    copie = copy.deepcopy(donnees)

    def _parcourir(noeud: Any) -> None:
        if isinstance(noeud, dict):
            if isinstance(noeud.get("excerpt"), str) and "excerpt_exact" not in noeud:
                noeud["excerpt_exact"] = noeud["excerpt"]
                noeud["excerpt"] = extrait_lisible(noeud["excerpt"])
            for valeur in noeud.values():
                _parcourir(valeur)
        elif isinstance(noeud, list):
            for valeur in noeud:
                _parcourir(valeur)

    _parcourir(copie)
    return copie
