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

# Le texte vient de l'IA mais aussi de l'éditeur : entrée non fiable. Aucun
# motif ci-dessous ne peut revenir en arrière de façon quadratique (classes
# bornées, sans DOTALL) et l'emphase est lue par un balayage itératif à pile
# (pas de récursion, temps linéaire).
MAX_INLINE = 5000            # caractères analysés d'un bloc ; au-delà, découpe sans perte
MAX_LIGNE_STRUCTURE = 2000   # une ligne plus longue n'est jamais une ligne de séparation de tableau

_LIEN = re.compile(r"\[([^\]\n]{1,300})\]\([^)\s]{1,500}(?:\s+\"[^\"\n]{0,200}\")?\)")
_CODE = re.compile(r"`([^`\n]{1,500})`")
_BR = re.compile(r"<br\s{0,10}/?>", re.IGNORECASE)
_BALISE = re.compile(r"</?(?:b|i|strong|em|u|p|span)\b[^>\n]{0,200}>", re.IGNORECASE)
_MARQUEURS = re.compile(r"\*+|_+")


def _nettoyer(texte: str) -> str:
    texte = _BR.sub(" ", texte)
    texte = _BALISE.sub("", texte)
    texte = _CODE.sub(r"\1", texte)
    return _LIEN.sub(r"\1", texte)


@dataclass
class _Delim:
    """Suite de `*` ou de `_` repérée dans le texte."""
    car: str
    restant: int
    peut_ouvrir: bool
    peut_fermer: bool
    origine: int
    utilisee: bool = False


def _emphase(texte: str) -> list[Segment]:
    """Gras et italique par balayage à pile, une seule passe. Règles de
    flanquement à la CommonMark, allégées : une étoile entourée d'espaces
    (« 2 * 3 ») ou un soulignement au milieu d'un mot (« nom_de_variable »)
    reste du texte ; tout marqueur resté sans pendant est retiré."""
    noeuds: list[str | _Delim] = []
    evenements: dict[int, list[int]] = {}   # indice du nœud → deltas (gras ±1 : ±2, italique ±1 : ±1)
    piles: dict[str, list[int]] = {"*": [], "_": []}
    pos = 0
    for m in _MARQUEURS.finditer(texte):
        if m.start() > pos:
            noeuds.append(texte[pos:m.start()])
        pos = m.end()
        precedent = texte[m.start() - 1] if m.start() > 0 else " "
        suivant = texte[m.end()] if m.end() < len(texte) else " "
        car = m.group()[0]
        if car == "*":
            ouvre, ferme = not suivant.isspace(), not precedent.isspace()
        else:
            ouvre = not suivant.isspace() and not precedent.isalnum()
            ferme = not precedent.isspace() and not suivant.isalnum()
        d = _Delim(car, len(m.group()), ouvre, ferme, len(m.group()))
        idx = len(noeuds)
        noeuds.append(d)
        if d.peut_fermer:
            pile = piles[car]
            autre = piles["_" if car == "*" else "*"]
            while d.restant > 0 and pile:
                o_idx = pile[-1]
                o = noeuds[o_idx]
                assert isinstance(o, _Delim)
                if o.restant == 0:
                    pile.pop()
                    continue
                emploi = 3 if (d.restant >= 3 and o.restant >= 3) else 2 if (d.restant >= 2 and o.restant >= 2) else 1
                evenements.setdefault(o_idx, []).append(emploi)
                evenements.setdefault(idx, []).append(-emploi)
                o.restant -= emploi
                o.utilisee = d.utilisee = True
                d.restant -= emploi
                if o.restant == 0:
                    pile.pop()
                while autre and autre[-1] > o_idx:   # marqueurs croisés : périmés
                    autre.pop()
        if d.restant > 0 and d.peut_ouvrir:
            piles[car].append(idx)
    if pos < len(texte):
        noeuds.append(texte[pos:])

    segments: list[Segment] = []
    gras = italique = 0
    for idx, noeud in enumerate(noeuds):
        if isinstance(noeud, str):
            segments.append(Segment(noeud, gras > 0, italique > 0))
            continue
        # fermetures d'abord, ouvertures ensuite
        for emploi in sorted(evenements.get(idx, []), key=lambda e: e > 0):
            signe = 1 if emploi > 0 else -1
            if abs(emploi) in (2, 3):
                gras += signe
            if abs(emploi) in (1, 3):
                italique += signe
        # un seul `*` ou `_` isolé, jamais apparié : c'est du texte
        if not noeud.utilisee and noeud.origine == 1 and not (noeud.peut_ouvrir or noeud.peut_fermer):
            segments.append(Segment(noeud.car, gras > 0, italique > 0))
    return segments


def _decouper_long(texte: str) -> list[str]:
    """Blocs de `MAX_INLINE` caractères au plus, coupés sur une espace : aucun
    mot perdu, et le temps reste borné pour une ligne démesurée."""
    morceaux: list[str] = []
    while len(texte) > MAX_INLINE:
        coupe = texte.rfind(" ", 0, MAX_INLINE)
        coupe = coupe + 1 if coupe > 0 else MAX_INLINE
        morceaux.append(texte[:coupe])
        texte = texte[coupe:]
    morceaux.append(texte)
    return morceaux


def analyser_inline(texte: str) -> list[Segment]:
    """`**gras**`, `*italique*`, `***les deux***` → segments. Les marqueurs
    non appariés sont retirés : jamais de `**` imprimé."""
    brut: list[Segment] = []
    for morceau in _decouper_long(_nettoyer(texte)):
        brut.extend(_emphase(morceau))
    fusion: list[Segment] = []
    for s in brut:
        if not s.texte:
            continue
        if fusion and (fusion[-1].gras, fusion[-1].italique) == (s.gras, s.italique):
            fusion[-1] = Segment(fusion[-1].texte + s.texte, s.gras, s.italique)
        else:
            fusion.append(s)
    return fusion


# ─── Blocs ─────────────────────────────────────────────────────────────────

MAX_COLONNES_TABLEAU = 20
MAX_LIGNES_TABLEAU = 500

_PUCE = re.compile(r"^([ \t]*)[-*+•–][ \t]+(.*)$")
_NUM = re.compile(r"^([ \t]*)\d{1,3}[.)][ \t]+(.*)$")
_REGLE = re.compile(r"^[ \t]*(?:[-*_][ \t]*){3,}$")
_CELLULE_SEPARATEUR = re.compile(r":?-{2,}:?")


def _est_separateur(ligne: str) -> bool:
    """`|---|:--:|` : chaque cellule n'est que des tirets (et des deux-points)."""
    if len(ligne) > MAX_LIGNE_STRUCTURE or "-" not in ligne:
        return False
    cellules = _cellules(ligne)
    return bool(cellules) and all(_CELLULE_SEPARATEUR.fullmatch(c) for c in cellules)


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


def _titre(ligne: str) -> tuple[int, str] | None:
    """`### Texte` → (3, « Texte »). Sans motif : pas de retour en arrière."""
    brut = ligne.lstrip(" ")
    if len(ligne) - len(brut) > 3:
        return None
    niveau = len(brut) - len(brut.lstrip("#"))
    if not 1 <= niveau <= 6 or len(brut) == niveau or brut[niveau] not in " \t":
        return None
    return niveau, brut[niveau:].strip().rstrip("#").strip()


def _ligne_de_tableau_en_paragraphe(cellules: list[str]) -> Paragraphe | None:
    segments = analyser_inline(" | ".join(c for c in cellules if c))
    return Paragraphe(segments) if segments else None


def _tableau(entetes_bruts: list[str], lignes_brutes: list[list[str]]) -> list[Bloc]:
    """Tableau plafonné. Trop de colonnes : lignes de texte (« a | b | c »).
    Trop de lignes : les `MAX_LIGNES_TABLEAU` premières restent un tableau, les
    suivantes passent en paragraphes. Rien n'est supprimé en silence."""
    if len(entetes_bruts) > MAX_COLONNES_TABLEAU:
        textes = [_ligne_de_tableau_en_paragraphe(r) for r in [entetes_bruts, *lignes_brutes]]
        return [t for t in textes if t is not None]
    n = len(entetes_bruts)
    lignes: list[list[list[Segment]]] = []
    for cel in lignes_brutes[:MAX_LIGNES_TABLEAU]:
        if len(cel) > n:   # cellules en trop : regroupées dans la dernière, jamais perdues
            cel = cel[: n - 1] + [" | ".join(cel[n - 1:])]
        cel = cel + [""] * (n - len(cel))
        lignes.append([analyser_inline(c) for c in cel])
    blocs: list[Bloc] = [Tableau([analyser_inline(c) for c in entetes_bruts], lignes)]
    for cel in lignes_brutes[MAX_LIGNES_TABLEAU:]:
        reste = _ligne_de_tableau_en_paragraphe(cel)
        if reste is not None:
            blocs.append(reste)
    return blocs


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
        if not ligne.strip() or (len(ligne) <= MAX_LIGNE_STRUCTURE and _REGLE.match(ligne)):
            i += 1
            continue
        if en_code:
            blocs.append(Paragraphe(analyser_inline_brut(ligne.strip())))
            i += 1
            continue

        # Tableau : une ligne à barres suivie d'une ligne de séparation `|---|`
        if _est_ligne_tableau(ligne) and i + 1 < len(lignes) and _est_separateur(lignes[i + 1]):
            entetes = _cellules(ligne)
            corps: list[list[str]] = []
            j = i + 2
            while j < len(lignes) and lignes[j].strip() and _est_ligne_tableau(lignes[j]):
                corps.append(_cellules(lignes[j]))
                j += 1
            blocs.extend(_tableau(entetes, corps))
            i = j
            continue

        titre = _titre(ligne) if len(ligne) <= MAX_LIGNE_STRUCTURE else None
        if titre is not None:
            segs = analyser_inline(titre[1])
            if segs:
                blocs.append(Titre(titre[0], segs))
            i += 1
            continue

        m_puce, m_num = _PUCE.match(ligne), _NUM.match(ligne)
        if m_puce or m_num:
            numerotee = m_num is not None and m_puce is None
            elements: list[ElementListe] = []
            while i < len(lignes):
                cur = lignes[i].rstrip()
                mp, mn = _PUCE.match(cur), _NUM.match(cur)
                m_cur = mn if numerotee and mn else mp if not numerotee and mp else None
                if m_cur is None:
                    autre = mp or mn
                    if elements and autre is not None and _profondeur(autre.group(1)) == 1:
                        m_cur = autre   # sous-liste d'un autre genre
                    else:
                        break
                segs = analyser_inline(m_cur.group(2))
                if segs:
                    elements.append(ElementListe(_profondeur(m_cur.group(1)), segs))
                i += 1
                # ligne vide isolée entre deux éléments de la même liste
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


def analyser_inline_brut(texte: str) -> list[Segment]:
    """Texte littéral (bloc de code) : aucune mise en forme, découpe bornée."""
    return [Segment(m) for m in _decouper_long(texte) if m]
