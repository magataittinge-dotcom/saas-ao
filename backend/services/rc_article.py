"""Article du RC qui porte un passage cité (bloc 9, tranche 4) — lecture déterministe.

La signature (ou la phase, la condition) d'une pièce est lue dans un extrait du
règlement de la consultation (source_in_rc). Pour que l'utilisateur retrouve le
passage, l'écran cite l'article : le dernier intitulé d'article qui précède
l'extrait dans le texte du document. Rien n'est deviné : si aucun intitulé ne
précède l'extrait, ou si l'extrait est introuvable, la réponse est None et
l'écran ne cite que le document et la page.

Intitulés reconnus (une ligne, 120 caractères au plus) :
  • « Article 5 — … », « ARTICLE 5.2 : … », « Art. 5.2 … » ;
  • « 5.2 Présentation des candidatures » (numéro à points, sans ponctuation finale).
Un simple élément de liste (« 1. Un extrait Kbis ») n'est pas un article.
"""
import re
import unicodedata
from bisect import bisect_right
from typing import Optional

_ARTICLE = re.compile(r"^(?:article|art\.?)\s+(\d+(?:[.\-]\d+)*)\b\s*[-–—:.)]*\s*(.*)$", re.IGNORECASE)
_NUMERO_A_POINTS = re.compile(r"^(\d+(?:\.\d+)+)\s*[-–—:.)]?\s+([A-ZÀ-ÖØ-Þ][^\n]*)$")
_LONGUEUR_MAX = 120
_SONDE = 90   # caractères de l'extrait cherchés dans le texte


def _blancs(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("’", "'")).strip()


def _plie(s: str) -> str:
    s = unicodedata.normalize("NFKD", _blancs(s).casefold())
    return "".join(c for c in s if not unicodedata.combining(c))


def _intitule(ligne: str) -> Optional[str]:
    ligne = _blancs(ligne)
    if not ligne or len(ligne) > _LONGUEUR_MAX:
        return None
    m = _ARTICLE.match(ligne)
    if m:
        titre = m.group(2).strip(" -–—:.")
        return f"Article {m.group(1)}" + (f" — {titre}" if titre else "")
    m = _NUMERO_A_POINTS.match(ligne)
    if m and not ligne.endswith((";", ",", ".")):
        return f"Article {m.group(1)} — {m.group(2).strip()}"
    return None


class LecteurRc:
    """Un document lu une fois (texte plié ligne à ligne), interrogé pour chaque extrait."""

    def __init__(self, texte: Optional[str]):
        self._lignes = (texte or "").splitlines()
        self._flux, self._debuts = "", []
        for ligne in self._lignes:
            self._debuts.append(len(self._flux))
            self._flux += _plie(ligne) + " "

    def article_avant(self, extrait: Optional[str]) -> Optional[str]:
        """« Article 5.2 — Présentation des candidatures », ou None."""
        if not self._lignes or not extrait:
            return None
        sonde = _plie(extrait)[:_SONDE].strip()
        if len(sonde) < 15:
            return None
        pos = self._flux.find(sonde)
        if pos < 0:
            return None
        k = bisect_right(self._debuts, pos) - 1
        for i in range(k, -1, -1):
            trouve = _intitule(self._lignes[i])
            if trouve:
                return trouve
        return None


def article_avant(texte: Optional[str], extrait: Optional[str]) -> Optional[str]:
    """Un seul extrait : voir LecteurRc pour en lire plusieurs dans le même document."""
    return LecteurRc(texte).article_avant(extrait)
