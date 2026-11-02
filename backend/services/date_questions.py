"""Date limite des questions à l'acheteur — lue dans le RC, sans IA, 0 € API.

Le règlement de la consultation fixe, en général, jusqu'à quand les candidats peuvent poser leurs questions :
  • en date : « les demandes de renseignements complémentaires doivent parvenir au plus tard le 12/03/2027 » ;
  • par rapport à la remise : « … au plus tard 10 jours avant l'échéance de dépôt des plis ».

Ce module lit ces formules, calcule la date quand elle est relative à la date limite de remise (jours calendaires ou
semaines) et garde la phrase source. Quand rien n'est lisible, ou quand la formule n'est pas calculable sans deviner
(jours ouvrés, ouvrables ou francs, heures non multiples de 24, date de remise inconnue), la réponse est « à vérifier dans
le RC » : jamais de date inventée.

Rappel de droit, cité prudemment : l'acheteur répond en principe aux demandes de renseignements complémentaires faites en
temps utile six jours au plus tard avant l'échéance du dépôt (article R2132-6 du Code de la commande publique). Le RC
peut fixer une date plus précoce pour les questions ; c'est elle qui compte. Voir `RAPPEL_REGLE`.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date, timedelta
from typing import Iterable, Optional

RAPPEL_REGLE = (
    "Le Code de la commande publique (article R2132-6) prévoit que l'acheteur répond aux demandes de renseignements "
    "complémentaires faites en temps utile six jours au plus tard avant l'échéance du dépôt des offres. "
    "Si le règlement de la consultation fixe une date plus précoce pour les questions, c'est celle-ci qu'il faut respecter."
)
A_VERIFIER = "À vérifier dans le RC"

_MOIS = {"janvier": 1, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6, "juillet": 7, "aout": 8,
         "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12}
_MOTS_NOMBRES = {
    "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5, "six": 6, "sept": 7, "huit": 8, "neuf": 9,
    "dix": 10, "onze": 11, "douze": 12, "treize": 13, "quatorze": 14, "quinze": 15, "seize": 16, "dix-sept": 17,
    "dix-huit": 18, "dix-neuf": 19, "vingt": 20, "vingt-et-un": 21, "vingt et un": 21, "vingt-deux": 22,
    "vingt-trois": 23, "vingt-quatre": 24, "vingt-cinq": 25, "vingt-six": 26, "vingt-sept": 27, "vingt-huit": 28,
    "vingt-neuf": 29, "trente": 30,
}
_NOMBRE = r"(?:\d{1,3}|" + "|".join(sorted((re.escape(m) for m in _MOTS_NOMBRES), key=len, reverse=True)) + r")"

_DECLENCHEUR = re.compile(
    r"\b(?:questions?|demandes?\s+de\s+renseignements?|renseignements?\s+complementaires?|"
    r"complements?\s+d'information|demandes?\s+d'information|demandes?\s+de\s+precisions?)\b")
_RELATIVE = re.compile(
    rf"(?P<n>{_NOMBRE})(?:\s*\(\s*(?P<chiffres>\d{{1,3}})\s*\))?\s+(?P<unite>jours?|semaines?|heures?)"
    r"(?:\s+(?P<qualif>calendaires?|ouvres?|ouvrables?|francs?|pleins?))?"
    r"(?:\s+(?:au\s+plus\s+tard|au\s+minimum|minimum))?"
    r"\s+(?:avant|precedant)\s+(?:l[ae]\s+)?(?:date|remise|reception|depot|limite)")
_DATE_NUM = r"\d{1,2}[/.]\d{1,2}[/.]\d{4}"
_DATE_TXT = r"\d{1,2}(?:er)?\s+(?:" + "|".join(_MOIS) + r")\s+\d{4}"
_ABSOLUE = re.compile(
    r"(?:au\s+plus\s+tard\s+(?:le|pour\s+le)|avant\s+le|jusqu'(?:a|au)\s+(?:la\s+date\s+du\s+|le\s+)?|jusqu'au|d'ici\s+le|"
    r"avant\s+la\s+date\s+du|(?:est\s+|sont\s+)?(?:fixee?s?|arretee?s?|limitee?s?)\s+(?:au|le)|:)\s*(?P<date>" + _DATE_NUM + "|" + _DATE_TXT + r")"
    r"(?:\s*(?:a|avant)?\s*(?P<h>\d{1,2})\s*h\s*(?P<m>\d{2})?)?")
_REPONSE_ACHETEUR = re.compile(r"communiqu|repond|reponses?\b|renvoy")
_FIN_DE_PHRASE = re.compile(r"[.!?]\s+[A-ZÀ-Ý]")
_PORTEE = 320   # caractères lus après le mot déclencheur


def _plie(texte: str) -> str:
    """Minuscules sans accents ni apostrophe typographique ; même longueur que l'original (positions conservées)."""
    sans = "".join(c for c in unicodedata.normalize("NFKD", texte.replace("’", "'").replace(" ", " ").lower())
                   if not unicodedata.combining(c))
    return sans if len(sans) == len(texte) else texte.lower()


def _date(brut: str) -> Optional[date]:
    brut = brut.strip()
    m = re.fullmatch(r"(\d{1,2})[/.](\d{1,2})[/.](\d{4})", brut)
    try:
        if m:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        m = re.fullmatch(r"(\d{1,2})(?:er)?\s+(\w+)\s+(\d{4})", brut)
        if m and m.group(2) in _MOIS:
            return date(int(m.group(3)), _MOIS[m.group(2)], int(m.group(1)))
    except ValueError:
        return None
    return None


def _entier(m: re.Match) -> Optional[int]:
    brut = (m.group("chiffres") or m.group("n")).strip()
    if brut.isdigit():
        return int(brut)
    return _MOTS_NOMBRES.get(brut)


def _extrait(texte: str, debut: int, fin: int, rayon: int = 90) -> str:
    return " ".join(texte[max(0, debut - rayon): min(len(texte), fin + rayon)].split())


def _chercher(nom: str, texte: str, remise: Optional[date]) -> Optional[dict]:
    norm = _plie(texte)
    for decl in _DECLENCHEUR.finditer(norm):
        debut = decl.start()
        fenetre_fin = min(len(norm), decl.end() + _PORTEE)
        coupure = _FIN_DE_PHRASE.search(texte, decl.end(), fenetre_fin)
        if coupure:
            fenetre_fin = coupure.start() + 1
        candidats = [m for m in (_RELATIVE.search(norm, decl.end(), fenetre_fin), _ABSOLUE.search(norm, decl.end(), fenetre_fin)) if m]
        if not candidats:
            continue
        trouve = min(candidats, key=lambda m: m.start())
        # « Les réponses seront communiquées six jours avant… » : c'est le délai de l'acheteur, pas celui des questions
        if _REPONSE_ACHETEUR.search(norm[decl.end():trouve.start()]):
            continue
        extrait = _extrait(texte, debut, trouve.end())
        base = {"document": nom, "extrait": extrait}
        if trouve.re is _ABSOLUE:
            jour = _date(trouve.group("date"))
            if jour is None:
                continue
            heure = f"{int(trouve.group('h'))}h{trouve.group('m') or '00'}" if trouve.group("h") else None
            return {**base, "statut": "trouvee", "regle": "absolue", "date": jour.isoformat(), "heure": heure, "jours": None, "motif": None}
        n = _entier(trouve)
        unite = trouve.group("unite")
        qualif = (trouve.group("qualif") or "").rstrip("s")
        if n is None:
            continue
        if unite.startswith("semaine"):
            jours: Optional[int] = n * 7
        elif unite.startswith("heure"):
            jours = n // 24 if n % 24 == 0 else None
        else:
            jours = n
        res = {**base, "regle": "relative", "heure": None, "jours": jours, "date": None}
        if jours is None or qualif in ("ouvre", "ouvrable", "franc"):
            return {**res, "statut": "a_verifier", "motif": "Délai en jours ouvrés, francs ou en heures : à compter selon le calendrier du marché."}
        if remise is None:
            return {**res, "statut": "a_verifier", "motif": "La date de remise des offres n'est pas connue : le calcul n'est pas possible."}
        return {**res, "statut": "trouvee", "date": (remise - timedelta(days=jours)).isoformat(), "motif": None}
    return None


def trouver_date_questions(pieces: Iterable[tuple[str, str]], date_remise: Optional[date]) -> dict:
    """Date limite des questions lue dans les pièces (RC d'abord : passer le RC en premier).

    ``pieces`` : (nom du fichier, texte). ``date_remise`` : la date de remise, si elle est connue.
    Retourne toujours un dict : ``statut`` « trouvee » (``date`` ISO, ``regle`` « absolue » ou « relative », ``document``,
    ``extrait``) ou « a_verifier » (``motif`` ; ``extrait`` quand une formule a été lue sans pouvoir la calculer)."""
    for nom, texte in pieces:
        if not texte or texte.startswith("[document volumineux"):
            continue
        res = _chercher(nom, texte, date_remise)
        if res:
            return res
    return {"statut": "a_verifier", "regle": None, "date": None, "heure": None, "jours": None, "document": None, "extrait": None,
            "motif": "Aucune date limite des questions n'est lisible dans le règlement."}
