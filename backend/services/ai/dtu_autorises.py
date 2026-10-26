"""DTU autorisés dans le mémoire — lus SANS IA dans le DCE.

Décision du 26/10 : le mémoire ne cite un DTU que s'il figure dans le CCTP du
lot choisi ou dans les pièces communes (lot 00 / communes à tous les lots).
Un DTU trouvé seulement ailleurs (RC, CCTP d'un autre lot, référentiel des
skills, connaissance générale du modèle) n'est pas cité.

Ce module est pur : il lit du texte, ne touche ni la base ni le réseau, et ne
journalise aucun extrait du DCE. Tous les motifs sont bornés (espaces ≤ 3, pas
de quantificateur imbriqué) : temps linéaire, pas de ReDoS.
"""
from __future__ import annotations

import re
from bisect import bisect_right
from dataclasses import dataclass, field
from typing import Iterable, Optional

from models.project import TYPES_GRILLES_DE_PRIX
from services.document_tagger import _normalize_lot_num, get_documents_for_lot
from services.dpgf_ouvrages import est_tableur

# « DTU 41.2 », « NF DTU 41.2 », « DTU n° 41.2 », « D.T.U. 41.2 », « DTU26.1 »,
# « DTU \n23.1 » (retour à la ligne du PDF), « NF DTU 26-1 P1-2 ».
_NUM = r"\d{2}(?:[.\-]\d{1,2})?"
_TETE = re.compile(
    r"(?<![A-Za-z0-9])(?:NF\s{0,3})?D\.?T\.?U\.?"
    r"\s{0,3}(?:(?:n°|nº|no\.?|n\s?°|numéro)\s{0,3})?"
    rf"(?P<num>{_NUM})(?![0-9])",
    re.IGNORECASE,
)
# Partie du DTU juste après le numéro : « P1-1 », « - P3 », « P1-2 / P2 ».
_PARTIE = re.compile(r"\s{0,2}-?\s{0,2}(?P<p>P\d(?:-\d)?)(?![A-Za-z0-9])")
# Renvoi à un article : « §5.2 », « art. 5.2 », « article 5 ».
_ARTICLE = re.compile(r"\s{0,2}(?:§|art\.?|article|paragraphe)\s{0,2}\d{1,2}(?:\.\d{1,2}){0,3}", re.IGNORECASE)
# DTU suivants d'une énumération : « DTU 20.11 et 20.12, 26.1 ».
_SUITE = re.compile(
    r"\s{0,3}(?:,|;|/|&|\bet\b|\bou\b)\s{0,3}(?:(?:NF\s{0,3})?D\.?T\.?U\.?\s{0,3})?"
    r"(?P<num>\d{2}[.\-]\d{1,2})(?![0-9])",
    re.IGNORECASE,
)
# Marqueur de page porté par les pièces elles-mêmes (en-tête ou pied de page).
_PAGE = re.compile(r"\bPage\s{1,3}(\d{1,4})\s{0,3}(?:/|sur)\s{0,3}\d{1,4}\b", re.IGNORECASE)


@dataclass(frozen=True)
class MentionDtu:
    numero: str      # forme canonique : « 26.1 »
    debut: int
    fin: int
    partie: Optional[str] = None   # « P1-1 » si le texte la porte
    tete: bool = True              # False : DTU d'une énumération (« et 20.12 »)


def _canon(num: str) -> str:
    return num.replace("-", ".")


def trouver_dtu(texte: str) -> list[MentionDtu]:
    """Toutes les mentions de DTU numérotées du texte, dans l'ordre."""
    if not texte:
        return []
    mentions: list[MentionDtu] = []
    pos = 0
    while True:
        m = _TETE.search(texte, pos)
        if not m:
            break
        fin = m.end()
        partie = None
        p = _PARTIE.match(texte, fin)
        if p:
            partie, fin = p.group("p").upper(), p.end()
        a = _ARTICLE.match(texte, fin)
        if a:
            fin = a.end()
        mentions.append(MentionDtu(_canon(m.group("num")), m.start(), fin, partie, True))
        # Énumération : chaque numéro suivant est une mention à part entière.
        while True:
            s = _SUITE.match(texte, fin)
            if not s:
                break
            fin = s.end()
            mentions.append(MentionDtu(_canon(s.group("num")), s.start("num"), fin, None, False))
        pos = max(fin, m.end())
    return mentions


@dataclass
class DtuAutorise:
    numero: str
    sources: list[tuple[str, Optional[int]]] = field(default_factory=list)   # (pièce, page|None)

    @property
    def libelle(self) -> str:
        return f"NF DTU {self.numero}"


def _est_lot_zero(tags) -> bool:
    """Pièce rattachée au lot 00 (étiquette « 0 » / « 00 » / « lot00 »)."""
    return any(_normalize_lot_num(str(t)) == "0" for t in (tags or []))


def _pieces_sources(docs: Iterable) -> list:
    """Pièces dont les DTU comptent : CCTP du lot + pièces du lot 00, hors RC.

    `docs` est la liste déjà filtrée pour le lot (get_documents_for_lot) : les
    pièces des autres lots n'y figurent pas. Comptent : tout CCTP restant (celui
    du lot, ou un CCTP commun) et toute pièce rattachée au lot 00 quel que soit
    son type (l'annexe commune d'un DCE est souvent typée « autre »). Ne comptent
    pas : le RC, les diagnostics, notices, DT, PGC, plans… même communs à tous
    les lots (« all »), ni une grille de prix, un tableur ou une pièce remplie
    par l'entreprise (décision du 26/10 : coordinateur)."""
    gardees = []
    for d in docs:
        type_ = getattr(d, "type", None) or "autre"
        if (not getattr(d, "extracted_text", None) or getattr(d, "is_user_completed", False)
                or type_ in TYPES_GRILLES_DE_PRIX or est_tableur(getattr(d, "file_name", "") or "")
                or type_ == "rc"):
            continue
        if type_ == "cctp" or _est_lot_zero(getattr(d, "related_lots", None)):
            gardees.append(d)
    return gardees


def _page_de(marqueurs: list[tuple[int, int]], positions: list[int], offset: int) -> Optional[int]:
    if not marqueurs:
        return None
    i = bisect_right(positions, offset) - 1
    return marqueurs[i][1] if i >= 0 else 1   # avant le 1er marqueur : en-tête de la page 1


def dtu_autorises(docs: Iterable, selected_lot: Optional[str] = None,
                  lots_du_rc=None) -> dict[str, DtuAutorise]:
    """{numéro canonique → DtuAutorise} lu dans les pièces autorisées.

    Avec `selected_lot` (« lot5 »…), les pièces des autres lots sont écartées ici
    même (get_documents_for_lot) ; sans lui, `docs` doit déjà être filtré.

    La page vient des marqueurs « Page N / M » que la pièce porte dans son
    texte extrait ; sans marqueur, la page vaut None (le texte extrait ne porte
    pas de saut de page)."""
    res: dict[str, DtuAutorise] = {}
    if selected_lot:
        docs = get_documents_for_lot(list(docs), selected_lot, lots_du_rc)
    for d in _pieces_sources(docs):
        texte = d.extracted_text
        mentions = trouver_dtu(texte)
        if not mentions:
            continue
        marqueurs = [(m.start(), int(m.group(1))) for m in _PAGE.finditer(texte)]
        positions = [p for p, _ in marqueurs]
        vues: set[tuple[str, Optional[int]]] = set()
        for men in mentions:
            page = _page_de(marqueurs, positions, men.debut)
            cle = (men.numero, page)
            if cle in vues:
                continue
            vues.add(cle)
            res.setdefault(men.numero, DtuAutorise(men.numero)).sources.append((d.file_name, page))
    return res


def _cle_numero(numero: str) -> list[int]:
    return [int(x) for x in numero.split(".")]


def formater_liste_dtu(autorises: dict[str, DtuAutorise], max_sources: int = 3) -> str:
    """Bloc de prompt (bloc variable) : la liste fermée des DTU citables, avec la
    pièce et la page où chacun a été lu. Liste vide : aucune citation de DTU."""
    entete = "━━━ LISTE DES DTU AUTORISÉS (CCTP du lot + pièces communes) ━━━\n"
    if not autorises:
        return entete + (
            "Aucun DTU n'est écrit dans le CCTP du lot ni dans les pièces communes : "
            "ne cite AUCUN numéro de DTU ; écris « conformément aux règles de l'art »."
        )
    lignes = [
        entete
        + "Un DTU qui n'est pas dans cette liste ne doit JAMAIS être cité. Être dans la liste "
        "autorise à citer, pas à tout citer : n'emploie que ceux qui s'appliquent aux ouvrages du lot."
    ]
    for numero in sorted(autorises, key=_cle_numero):
        vus, morceaux = set(), []
        for piece, page in autorises[numero].sources:
            if (piece, page) in vus:
                continue
            vus.add((piece, page))
            morceaux.append(f"{piece}, p. {page}" if page else piece)
        reste = len(morceaux) - max_sources
        txt = " ; ".join(morceaux[:max_sources]) + (f" ; +{reste}" if reste > 0 else "")
        lignes.append(f"- {autorises[numero].libelle} — {txt}")
    return "\n".join(lignes)
