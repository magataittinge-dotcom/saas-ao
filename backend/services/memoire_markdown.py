"""Analyse du Markdown que produit l'IA pour le mémoire technique.

Entrée : le texte d'une section. Sortie : une liste de blocs typés
(`Titre`, `Paragraphe`, `Liste`, `Tableau`), dont les textes sont déjà
découpés en segments (`Segment`: texte, gras, italique). Aucun reste de
syntaxe (`###`, `**`, `|---|`) ne survit dans les textes produits.

Pourquoi un analyseur maison et non `markdown-it-py` : le sous-ensemble utile
est petit (titres, puces, numérotation, gras, italique, tableaux à barres) et
doit rester tolérant au Markdown « approximatif » de l'IA (étoile jamais
fermée, tableau sans barre de bord, puces « • »). Une bibliothèque CommonMark
stricte laisserait ces cas imprimés tels quels. Aucune dépendance ajoutée.

Module pur : pas de python-docx ici. Le rendu Word est dans `docx_exporter`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Segment:
    texte: str
    gras: bool = False
    italique: bool = False


@dataclass(frozen=True)
class Titre:
    niveau: int            # 1 à 6, tel qu'écrit par l'IA (# = 1)
    segments: list[Segment]


@dataclass(frozen=True)
class Paragraphe:
    segments: list[Segment]


@dataclass(frozen=True)
class ElementListe:
    profondeur: int        # 0 ou 1
    segments: list[Segment]


@dataclass(frozen=True)
class Liste:
    numerotee: bool
    elements: list[ElementListe]


@dataclass(frozen=True)
class Tableau:
    entetes: list[list[Segment]]
    lignes: list[list[list[Segment]]] = field(default_factory=list)


Bloc = Titre | Paragraphe | Liste | Tableau


# ─── Inline ────────────────────────────────────────────────────────────────

# Du plus englobant au plus étroit. L'italique par étoile exige un caractère
# non blanc contre chaque étoile (« 2 * 3 » n'est pas de l'italique) ; par
# soulignement, des limites de mot (« nom_de_variable » reste intact).
_INLINE: tuple[tuple[re.Pattern[str], bool, bool], ...] = (
    (re.compile(r"\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*", re.DOTALL), True, True),
    (re.compile(r"\*\*(?=\S)(.+?)(?<=\S)\*\*", re.DOTALL), True, False),
    (re.compile(r"(?<![\w_])__(?=\S)(.+?)(?<=\S)__(?![\w_])", re.DOTALL), True, False),
    (re.compile(r"\*(?=[^\s*])(.+?)(?<=[^\s*])\*", re.DOTALL), False, True),
    (re.compile(r"(?<![\w_])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![\w_])", re.DOTALL), False, True),
)
_LIEN = re.compile(r"\[([^\]]+)\]\((?:[^)\s]+)(?:\s+\"[^\"]*\")?\)")
_CODE = re.compile(r"`([^`]+)`")
_BR = re.compile(r"<br\s*/?>", re.IGNORECASE)
_BALISE = re.compile(r"</?(?:b|i|strong|em|u|p|span)\b[^>]*>", re.IGNORECASE)


def _nettoyer(texte: str) -> str:
    texte = _BR.sub(" ", texte)
    texte = _BALISE.sub("", texte)
    texte = _CODE.sub(r"\1", texte)
    texte = _LIEN.sub(r"\1", texte)
    return texte


def _decouper(texte: str, gras: bool, italique: bool) -> list[Segment]:
    meilleur: tuple[int, int, re.Match[str], bool, bool] | None = None
    for motif, g, i in _INLINE:
        m = motif.search(texte)
        if m and (meilleur is None or m.start() < meilleur[0]):
            meilleur = (m.start(), m.end(), m, g, i)
    if meilleur is None:
        return [Segment(texte, gras, italique)] if texte else []
    debut, fin, m, g, i = meilleur
    return (
        _decouper(texte[:debut], gras, italique)
        + _decouper(m.group(1), gras or g, italique or i)
        + _decouper(texte[fin:], gras, italique)
    )


def analyser_inline(texte: str) -> list[Segment]:
    """`**gras**`, `*italique*`, `***les deux***` → segments. Les marqueurs
    non appariés sont retirés : jamais de `**` imprimé."""
    segments = _decouper(_nettoyer(texte), False, False)
    propres: list[Segment] = []
    for s in segments:
        t = s.texte.replace("**", "").replace("__", "")
        if t:
            propres.append(Segment(t, s.gras, s.italique))
    # fusion des segments voisins de même style
    fusion: list[Segment] = []
    for s in propres:
        if fusion and (fusion[-1].gras, fusion[-1].italique) == (s.gras, s.italique):
            fusion[-1] = Segment(fusion[-1].texte + s.texte, s.gras, s.italique)
        else:
            fusion.append(s)
    return fusion


# ─── Blocs ─────────────────────────────────────────────────────────────────

_TITRE = re.compile(r"^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$")
_PUCE = re.compile(r"^(\s*)(?:[-*+•–])\s+(.*)$")
_NUM = re.compile(r"^(\s*)\d{1,3}[.)]\s+(.*)$")
_SEPARATEUR_TABLEAU = re.compile(r"^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$")
_REGLE = re.compile(r"^\s*(?:[-*_]\s*){3,}$")


def _cellules(ligne: str) -> list[str]:
    ligne = ligne.strip()
    if ligne.startswith("|"):
        ligne = ligne[1:]
    if ligne.endswith("|") and not ligne.endswith("\\|"):
        ligne = ligne[:-1]
    return [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", ligne)]


def _est_ligne_tableau(ligne: str) -> bool:
    return "|" in ligne


def _profondeur(espaces: str) -> int:
    return 1 if len(espaces.expandtabs(4)) >= 2 else 0


def analyser(texte: str) -> list[Bloc]:
    """Markdown de section → blocs. Une ligne de texte = un paragraphe (comme
    l'ancien export), sauf les tableaux et les listes, regroupés."""
    lignes = (texte or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocs: list[Bloc] = []
    i = 0
    en_code = False
    while i < len(lignes):
        ligne = lignes[i].rstrip()
        if ligne.strip().startswith("```"):
            en_code = not en_code
            i += 1
            continue
        if not ligne.strip() or _REGLE.match(ligne):
            i += 1
            continue
        if en_code:
            blocs.append(Paragraphe([Segment(ligne.strip())]))
            i += 1
            continue

        # Tableau : une ligne à barres suivie d'une ligne de séparation `|---|`
        if (
            _est_ligne_tableau(ligne)
            and i + 1 < len(lignes)
            and _SEPARATEUR_TABLEAU.match(lignes[i + 1])
            and "|" in lignes[i + 1] + ligne
        ):
            entetes = _cellules(ligne)
            lignes_t: list[list[list[Segment]]] = []
            j = i + 2
            while j < len(lignes) and lignes[j].strip() and _est_ligne_tableau(lignes[j]):
                cel = _cellules(lignes[j])
                cel = (cel + [""] * len(entetes))[: len(entetes)]  # rectangulaire
                lignes_t.append([analyser_inline(c) for c in cel])
                j += 1
            blocs.append(Tableau([analyser_inline(c) for c in entetes], lignes_t))
            i = j
            continue

        m = _TITRE.match(ligne)
        if m:
            segs = analyser_inline(m.group(2))
            if segs:
                blocs.append(Titre(len(m.group(1)), segs))
            i += 1
            continue

        m_puce, m_num = _PUCE.match(ligne), _NUM.match(ligne)
        if m_puce or m_num:
            numerotee = bool(m_num) and not m_puce
            elements: list[ElementListe] = []
            while i < len(lignes):
                cur = lignes[i].rstrip()
                mp, mn = _PUCE.match(cur), _NUM.match(cur)
                if numerotee and mn:
                    m_cur = mn
                elif not numerotee and mp:
                    m_cur = mp
                elif elements and (mp or mn) and _profondeur((mp or mn).group(1)) == 1:
                    m_cur = mp or mn  # sous-liste d'un autre genre
                else:
                    break
                segs = analyser_inline(m_cur.group(2))
                if segs:
                    elements.append(ElementListe(_profondeur(m_cur.group(1)), segs))
                i += 1
                # lignes vides isolées entre deux éléments de la même liste
                if i + 1 < len(lignes) and not lignes[i].strip():
                    suivante = lignes[i + 1].rstrip()
                    if (numerotee and _NUM.match(suivante)) or (not numerotee and _PUCE.match(suivante)):
                        i += 1
            if elements:
                blocs.append(Liste(numerotee, elements))
            continue

        segs = analyser_inline(ligne.strip().lstrip(">").strip())
        if segs:
            blocs.append(Paragraphe(segs))
        i += 1
    return blocs
