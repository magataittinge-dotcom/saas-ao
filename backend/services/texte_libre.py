"""Nettoyage d'un texte libre de l'entreprise avant de le citer dans un prompt (B2/B3).

Pas de caractères de contrôle, pas de lignes de séparation du prompt (━━━), pas de délimiteurs <<< >>> : le texte ne
peut pas fermer lui-même le bloc dans lequel il est placé. 1 000 caractères au plus."""
import re

_MARQUES = re.compile(r"[━═─]+|<{2,}|>{2,}|[\x00-\x08\x0b-\x1f\x7f]")
MAX = 1000


def texte_libre_propre(texte, maximum: int = MAX) -> str:
    t = _MARQUES.sub(" ", str(texte or ""))
    t = "\n".join(re.sub(r"[ \t]+", " ", ligne).strip() for ligne in t.splitlines())
    return re.sub(r"\n{3,}", "\n\n", t).strip()[:maximum]


def ligne_propre(texte, maximum: int = 160) -> str:
    """Une seule ligne (titres, noms), sans guillemets français qui fermeraient une citation."""
    return re.sub(r"\s+", " ", texte_libre_propre(texte, maximum * 2).replace("«", "").replace("»", "")).strip()[:maximum]
