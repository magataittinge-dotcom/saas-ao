"""
Ancrage verbatim des excerpts d'exigences (déterministe, 0 € API).

Promesse produit : chaque exigence est SOURCÉE — l'extrait affiché et
surligné existe mot pour mot dans le document. Mesure réelle avant ce
module : 7 % des excerpts IA étaient verbatim, 73 % introuvables (l'IA
condense avec « … », reformule, recolle des morceaux distants).

Trois niveaux, dans l'ordre :
  1. EXACT      — l'excerpt est déjà dans le texte source ;
  2. NORMALISÉ  — retrouvé après normalisation (apostrophes typographiques,
                  retours de ligne intra-phrase, césures, ligatures) →
                  RÉ-ANCRÉ sur le passage réel du document (verbatim) ;
  3. RÉCUPÉRÉ   — condensé/reformulé → la phrase réelle du document qui
                  contient le plus de termes significatifs de l'excerpt
                  est localisée (seuil strict) et retournée EN ENTIER.
Sinon : None — l'ancre est invalide, l'UI n'affiche PAS de bouton source
(jamais de viewer qui ment). Compteurs loggés.
"""
import logging
import os
import re
import threading
from array import array
import unicodedata
import math
from collections import Counter, OrderedDict, defaultdict
from typing import Dict, List, NamedTuple, Optional, Tuple

from services import pdf_lecture

logger = logging.getLogger(__name__)

_MIN_RECOVER_SCORE = 0.55   # ≥ 55 % des termes significatifs retrouvés
_MIN_TERMS = 3
_MIN_TERMES_COMMUNS = 3     # et au moins 3 termes significatifs en commun

# Mots vides (forme normalisée : minuscules, sans accents). Ils ne comptent pas
# dans la récupération par termes : sur Gueux, « dans », « pour », « toutes »
# rapprochaient des passages sans rapport.
_MOTS_VIDES = frozenset("""
a ai au aux avec ce ces cet cette ci cela celle celles celui ceux comme dans de des du elle elles en
entre et est etre eux il ils je la le les leur leurs lors lui ma mais me meme mes moins mon ne ni nos
notre nous on ou par pas peu plus pour qu que quel quelle quelles quels qui sa sans se selon ses si son
sont sous sur ta te tes toi ton tous tout toute toutes tres tu un une vos votre vous y
sera seront doit doivent devra devront peut peuvent pourra pourront ainsi aussi afin dont donc etc
cas fait faire ete avoir ont present presente presents presentes article articles chaque autre autres
""".split())
_MOT = re.compile(r"[^\W_]+")   # mot entier : lettres et chiffres
# Un terme fait au moins 3 caractères : « ITE », « DTU », « RAL », « feu » comptent ;
# « s1 », « mm », « 20 » non (à 2 caractères, un extrait réel de Gueux, un
# classement de réaction au feu, partait dans le CCTP d'un autre lot).
_TERME_MIN_LONGUEUR = 3


def _forme(mot: str) -> str:
    """Forme de comparaison d'un mot normalisé : ligatures dépliées, pluriel en
    -s/-x ramené au singulier (« panneaux » → « panneau »)."""
    mot = mot.replace("œ", "oe").replace("æ", "ae")
    return mot[:-1] if len(mot) > 3 and mot[-1] in "sx" else mot


def _termes(texte_normalise: str) -> List[str]:
    """Termes significatifs d'un texte normalisé : mots entiers d'au moins
    _TERME_MIN_LONGUEUR caractères, sans les mots vides, sous leur forme."""
    return [_forme(m) for m in _MOT.findall(texte_normalise)
            if len(m) >= _TERME_MIN_LONGUEUR and m not in _MOTS_VIDES]


def _norm_char(ch: str) -> str:
    mapping = {"’": "'", "‘": "'", "ʼ": "'",
               "“": '"', "”": '"', "«": '"', "»": '"',
               "–": "-", "—": "-", "…": "...",
               "◼": " ", " ": " "}
    return mapping.get(ch, ch)


# Forme normalisée de chaque caractère, calculée une fois : (blanc ?, forme).
# La normalisation d'un DCE passait ~1 µs par caractère dans NFKD.
_CHAR_NORM: Dict[str, Tuple[bool, str]] = {}


def _char_norm(ch: str) -> Tuple[bool, str]:
    c = _norm_char(ch)
    if c.isspace():
        return True, " "
    decomposed = unicodedata.normalize("NFKD", c)
    base = "".join(x for x in decomposed if not unicodedata.combining(x)) or c
    return False, base.lower()


def _normalize_with_map(text: str) -> Tuple[str, List[int]]:
    """Normalisation POSITION-PRÉSERVANTE : retourne (texte normalisé,
    mapping index normalisé → index original)."""
    out: List[str] = []
    idx_map: List[int] = []
    prev_space = True
    memo = _CHAR_NORM
    for i, ch in enumerate(text):
        r = memo.get(ch)
        if r is None:
            r = memo[ch] = _char_norm(ch)
        if r[0]:
            if prev_space:
                continue
            out.append(" ")
            idx_map.append(i)
            prev_space = True
            continue
        prev_space = False
        for c in r[1]:
            out.append(c)
            idx_map.append(i)
    return "".join(out), idx_map


def _normalize(text: str) -> str:
    return _normalize_with_map(text)[0]


# « Flux alphanumérique » : NFKD, sans accents, minuscules, lettres et chiffres
# seulement (blancs et ponctuation retirés). C'est la forme de comparaison du
# futur surligneur (A). Elle sert de sonde à resolve_pages : les écarts de blancs
# entre lecteurs PDF (« 1 - X » contre « 1- X », mots collés, césure en fin
# de ligne) ne font plus perdre la page.
_NON_ALPHANUMERIQUE = re.compile(r"[\W_]+")   # \w = str.isalnum() + « _ »


def _flux_normalise(texte_normalise: str) -> str:
    """Flux d'un texte déjà passé par _normalize (pages du cache de l'ancrage)."""
    return _NON_ALPHANUMERIQUE.sub("", texte_normalise)


def _flux(texte: str) -> str:
    return _flux_normalise(_normalize(texte))


_SENTENCE_BOUNDARY = re.compile(r"(?<=[.;:!?])\s+|\n{2,}")


def _expand_to_sentence(doc: str, start: int, end: int) -> Tuple[int, int]:
    """Étend [start, end) aux limites de phrase dans le texte original."""
    left = max((doc.rfind(p, 0, start) for p in (". ", ".\n", " ;", ":\n", "\n\n")),
               default=-1)
    left = max(left, doc.rfind("\n1/", 0, start), doc.rfind("◼", 0, start))
    s = left + 2 if left >= 0 else 0
    m = re.search(r"[.;!?](\s|$)|\n\n|\n◼", doc[end:end + 400])
    e = end + m.end() if m else min(len(doc), end + 200)
    return s, e


# Cache de normalisation par document (l'ancrage de 448 exigences contre
# les mêmes ~10 docs re-normalisait 50k caractères à chaque appel). Clé = le
# TEXTE lui-même : chaque portée d'analyse relit les textes en base (nouveaux
# objets) — l'ancienne clé id() ne servait qu'une portée et ne libérait
# jamais rien (≈ 58 Mo par million de caractères). LRU borné en caractères ;
# le mapping de positions est un array d'entiers (4 octets par caractère).
_DOC_CACHE: "OrderedDict[str, tuple]" = OrderedDict()
_DOC_CACHE_MAX_CARACTERES = 8_000_000   # ≈ 4 DCE complets comme Gueux (1,7 M)
_cache_verrou = threading.Lock()


def _doc_index(doc_text: str):
    """(texte normalisé, mapping vers l'original) d'un document, en cache."""
    with _cache_verrou:
        cached = _DOC_CACHE.get(doc_text)
        if cached is not None:
            _DOC_CACHE.move_to_end(doc_text)
            return cached
    norm, idx_map = _normalize_with_map(doc_text)
    cached = (norm, array("I", idx_map))
    with _cache_verrou:
        _DOC_CACHE[doc_text] = cached
        total = sum(len(k) for k in _DOC_CACHE)
        while total > _DOC_CACHE_MAX_CARACTERES and len(_DOC_CACHE) > 1:
            ancien, _ = _DOC_CACHE.popitem(last=False)
            total -= len(ancien)
    return cached


_POSITIONS_MAX_TERMES = 2_000   # par document ; au-delà, le mémo repart de zéro


def _positions_terme(terme: str, words: List[Tuple[str, int]], memo: Dict[str, "array"]) -> "array":
    """Indices des mots du document qui CONTIENNENT `terme` (même test que
    l'ancien balayage : `terme in mot`), calculés une fois par document.
    Mémo compact (array, 4 octets par position) et plafonné en nombre de termes.

    L'ancrage ne s'en sert plus (mots entiers, bloc 2) ; gardée tant que
    tests/test_ancrage_rapide.py la vérifie."""
    pos = memo.get(terme)
    if pos is None:
        if len(memo) >= _POSITIONS_MAX_TERMES:
            memo.clear()
        pos = memo[terme] = array("I", (j for j, (w, _) in enumerate(words) if terme in w))
    return pos


# ─── Ancrage sur toutes les pièces reçues, score par phrase (bloc 2) ─────────

class Ancrage(NamedTuple):
    """Où un extrait est ancré : pièce, [début, fin) dans son texte, niveau, score."""
    piece: str
    debut: int
    fin: int
    niveau: str     # « exact », « normalise », « segment » ou « recupere »
    score: float    # 1.0 si le texte est retrouvé tel quel ; sinon part pondérée des termes


# Phrases d'une pièce : coupure après . ; ! ?, aux lignes vides et avant une
# puce ou un numéro de liste ; une phrase de plus de 400 caractères est recoupée
# aux retours à la ligne, en morceaux d'au moins 200 caractères.
_COUPE_PHRASES = re.compile(r"(?<=[.;!?])\s+|\n\s*\n|\n(?=\s*(?:[-•◼]|\d+(?:\.\d+)*[.)]?\s))")
_PHRASE_MAX = 400
_PHRASE_MORCEAU = 200
_ETIQUETTE_MAX = 16   # longueur moyenne des lignes en dessous de laquelle un bloc est fait d'étiquettes
# Extrait condensé (« … ») ou fait de phrases recollées : morceaux cherchés un à un.
_COUPE_EXTRAIT = re.compile(r"…|\.\.\.|(?<=[.;!?])\s+(?=[A-ZÀÂÉÈÊÎÔÛÇ«\"])")
_BONUS_PREFERENCE = 0.03   # pièce désignée par l'IA ou pièce du lot : départage deux scores proches
_MALUS_PAIRE = 0.03        # deux phrases consécutives : un peu moins sûres qu'une seule
_UNITES_CACHE: "OrderedDict[str, list]" = OrderedDict()
_UNITES_CACHE_MAX_CARACTERES = 8_000_000


def _sans_blancs(texte: str, a: int, b: int) -> Tuple[int, int]:
    """Bornes [a, b) resserrées pour ne commencer ni finir sur un blanc."""
    while a < b and texte[a].isspace():
        a += 1
    while b > a and texte[b - 1].isspace():
        b -= 1
    return a, b


def _morceaux(texte: str, a: int, b: int) -> List[Tuple[int, int]]:
    lignes = texte[a:b].split("\n")
    pleines = [x.strip() for x in lignes if x.strip()]
    if len(pleines) >= 4 and sum(map(len, pleines)) / len(pleines) < _ETIQUETTE_MAX:
        # Étiquettes de plan ou de carnet, sans ponctuation : une ligne = une phrase
        # (sinon un paquet d'étiquettes sans rapport réunit assez de termes par hasard).
        out, pos = [], a
        for x in lignes:
            if x.strip():
                out.append((pos, pos + len(x)))
            pos += len(x) + 1
        return out
    if b - a <= _PHRASE_MAX:
        return [(a, b)]
    out, debut = [], a
    k = texte.find("\n", a, b)
    while k >= 0:
        if k - debut >= _PHRASE_MORCEAU:
            out.append((debut, k))
            debut = k + 1
        k = texte.find("\n", k + 1, b)
    out.append((debut, b))
    return out


# ─── Aimants : passages qui ne sont jamais une source (bloc 2, tranche 3) ────
# Sur Gueux, 133 extraits sur 410 reposaient sur un aimant, et 10 des 12 sources
# fausses de l'échantillon jugé à la main en étaient (G2) :
#   • en-têtes et pieds de page : lignes (chiffres masqués) parmi les 6
#     premières ou dernières lignes d'au moins la moitié des pages, 3 pages au
#     moins (les pages sont jointes par « \n\n » à l'extraction) ;
#   • lignes de sommaire (points ou soulignés de conduite, numéro de page) ;
#   • tableau des lots (en-tête « N° lot », « numéro lot »… puis au moins 3
#     rangées numérotées), sauf pour une exigence qui porte sur l'allotissement.
_LIGNES_DE_BORD = 6
_PAGES_MIN_BORD = 3
_SOMMAIRE = re.compile(r"(?:\.{4,}|_{4,}|…{2,}|(?:\. ){3,})\s*\d*\s*$")
_CHIFFRES = re.compile(r"\d+")
_LETTRE = re.compile(r"[^\W\d_]")
_ENTETE_TABLEAU_LOTS = re.compile(
    r"\bn[°o]?\s*\.?\s*lots?\b|\blots?\s*n[°o]|\bnumeros?\s+(?:de\s+|du\s+)?lots?\b"
    r"|\bliste\s+des\s+lots\b|\bdesignation\s+des\s+lots\b|\bintitules?\s+des\s+lots?\b")
_INTITULE_SEUL = re.compile(r"^(?:intitules?|designations?|libelles?)$")
_RANGEE_LOT = re.compile(r"^(?:lot\s*)?(?:n[°o]\s*)?\d{1,2}[a-z]?(?:$|\s*[-:.)/]?\s+\S)")
_SUR_LES_LOTS = re.compile(
    r"\ballot\w*|\blots?\s+(?:separes?|distincts?|suivants?)\b|\bdecompos\w*\s+en\s+(?:\d+\s+)?lots?\b"
    r"|\b(?:liste|nombre|intitules?|designations?)\s+des\s+lots\b"
    r"|\b(?:un\s+ou\s+plusieurs|plusieurs|chaque|tous\s+les|l'ensemble\s+des)\s+lots?\b"
    r"|\blot\s+unique\b|\b\d+\s+lots\b")
_AIMANTS_CACHE: "OrderedDict[str, tuple]" = OrderedDict()


def _forme_ligne(ligne: str) -> str:
    return _CHIFFRES.sub("#", " ".join(ligne.split()))


def _zones_tableau_lots(texte: str) -> List[Tuple[int, int]]:
    """[(début, fin)] des tableaux des lots : un en-tête, puis au moins 3
    rangées numérotées ; entre deux rangées, 2 lignes au plus (intitulé, index)."""
    lignes, pos = [], 0
    for brut in texte.split("\n"):
        lignes.append((pos, pos + len(brut), _normalize(brut).strip()))
        pos += len(brut) + 1
    zones, i, n = [], 0, len(lignes)
    while i < n:
        ligne = lignes[i][2]
        suivante = next((x[2] for x in lignes[i + 1:i + 3] if x[2]), "")
        # En-tête du tableau : il nomme la colonne des lots, sans numéro (« LOT N° 7 :
        # PLOMBERIE » est le titre d'un seul lot, en tête de chaque page de son CCTP).
        if _CHIFFRES.search(ligne) or not (
                _ENTETE_TABLEAU_LOTS.search(ligne)
                or (ligne in ("lot", "lots") and _INTITULE_SEUL.match(suivante))):
            i += 1
            continue
        j, rangees, hors, fin = i + 1, 0, 0, lignes[i][1]
        while j < n and hors < 3:
            s = lignes[j][2]
            if s:
                if _RANGEE_LOT.match(s):
                    rangees, hors, fin = rangees + 1, 0, lignes[j][1]
                else:
                    hors += 1
                    if hors == 1 and rangees:
                        fin = lignes[j][1]   # intitulé ou index de la dernière rangée
            j += 1
        if rangees >= 3:
            zones.append((lignes[i][0], fin))
            i = j
        else:
            i += 1
    return zones


def _aimants(texte: str) -> tuple:
    """(lignes de bord des pages, zones des tableaux des lots) d'une pièce, en cache."""
    with _cache_verrou:
        a = _AIMANTS_CACHE.get(texte)
        if a is not None:
            _AIMANTS_CACHE.move_to_end(texte)
            return a
    pages = texte.split("\n\n\n")
    bord = set()
    if len(pages) >= _PAGES_MIN_BORD:
        compte: Counter = Counter()
        for p in pages:
            ls = [_forme_ligne(x) for x in p.splitlines() if x.strip()]
            compte.update(set(ls[:_LIGNES_DE_BORD] + ls[-_LIGNES_DE_BORD:]))
        seuil = max(_PAGES_MIN_BORD, 0.5 * len(pages))
        bord = {x for x, c in compte.items() if c >= seuil and len(_LETTRE.findall(x)) >= 3}
    a = (frozenset(bord), tuple(_zones_tableau_lots(texte)))
    with _cache_verrou:
        _AIMANTS_CACHE[texte] = a
        total = sum(len(k) for k in _AIMANTS_CACHE)
        while total > _UNITES_CACHE_MAX_CARACTERES and len(_AIMANTS_CACHE) > 1:
            ancien, _ = _AIMANTS_CACHE.popitem(last=False)
            total -= len(ancien)
    return a


def _aimant_de_page(texte: str, a: int, b: int) -> bool:
    """Les lignes touchées par [a, b) sont au moins pour moitié des en-têtes,
    pieds de page ou lignes de sommaire (lignes sans 3 lettres ignorées)."""
    bord, _zones = _aimants(texte)
    la = texte.rfind("\n", 0, a) + 1
    lb = texte.find("\n", b)
    lignes = [x for x in texte[la:lb if lb >= 0 else len(texte)].splitlines()
              if len(_LETTRE.findall(x)) >= 3]
    if not lignes:
        return False
    n = sum(1 for x in lignes if _forme_ligne(x) in bord or _SOMMAIRE.search(x.strip()))
    return 2 * n >= len(lignes)


def _dans_tableau_lots(texte: str, a: int, b: int) -> bool:
    """[a, b) est au moins pour moitié dans un tableau des lots."""
    _bord, zones = _aimants(texte)
    dedans = sum(max(0, min(b, zb) - max(a, za)) for za, zb in zones)
    return 2 * dedans >= max(b - a, 1) and dedans > 0


def _est_aimant(texte: str, a: int, b: int, sur_les_lots: bool) -> bool:
    return _aimant_de_page(texte, a, b) or (not sur_les_lots and _dans_tableau_lots(texte, a, b))


def _unites(texte: str) -> list:
    """Phrases d'une pièce : [(début, fin, termes significatifs, aimant de page,
    dans le tableau des lots)], en cache par texte."""
    with _cache_verrou:
        u = _UNITES_CACHE.get(texte)
        if u is not None:
            _UNITES_CACHE.move_to_end(texte)
            return u
    out = []
    pos = 0
    for m in list(_COUPE_PHRASES.finditer(texte)) + [None]:
        fin = m.start() if m else len(texte)
        for a, b in _morceaux(texte, pos, fin):
            termes = frozenset(_termes(_normalize(texte[a:b])))
            if termes:
                out.append((a, b, termes, _aimant_de_page(texte, a, b), _dans_tableau_lots(texte, a, b)))
        pos = m.end() if m else len(texte)
    with _cache_verrou:
        _UNITES_CACHE[texte] = out
        total = sum(len(k) for k in _UNITES_CACHE)
        while total > _UNITES_CACHE_MAX_CARACTERES and len(_UNITES_CACHE) > 1:
            ancien, _ = _UNITES_CACHE.popitem(last=False)
            total -= len(ancien)
    return out


class _IndexPhrases:
    """Phrases de toutes les pièces d'un appel. Un terme pèse d'autant plus
    qu'il est rare (idf : log(1 + phrases / phrases qui le contiennent))."""

    def __init__(self, textes: List[str]):
        # (n° de pièce, début, fin, termes, aimant de page, dans le tableau des lots)
        self.unites = []
        df: Counter = Counter()
        for i, texte in enumerate(textes):
            for a, b, termes, aimant, tableau in _unites(texte):
                self.unites.append((i, a, b, termes, aimant, tableau))
                df.update(termes)
        n = len(self.unites)
        self.idf = {t: math.log(1 + n / c) for t, c in df.items()}
        self.idf_absent = math.log(1 + n) if n else 1.0
        self.inverse: Dict[str, List[int]] = defaultdict(list)
        for k, u in enumerate(self.unites):
            for t in u[3]:
                self.inverse[t].append(k)

    def _ecartee(self, k: int, sur_les_lots: bool) -> bool:
        _i, _a, _b, _t, aimant, tableau = self.unites[k]
        return aimant or (tableau and not sur_les_lots)

    def meilleure(self, termes: List[str], preferees: set,
                  sur_les_lots: bool = False) -> Optional[Tuple[int, int, int, float]]:
        """(n° de pièce, début, fin, score) de la meilleure phrase, ou paire de
        phrases consécutives : au moins 3 termes en commun et 55 % du poids des
        termes de l'extrait (un terme absent des pièces pèse le plus). Les
        aimants sont écartés. À score presque égal, une pièce de `preferees`
        gagne ; puis l'ordre des pièces."""
        q = set(termes)
        if len(q) < _MIN_TERMS:
            return None
        total = sum(self.idf.get(t, self.idf_absent) for t in q)
        poids: Dict[int, float] = defaultdict(float)
        for t in q:
            w = self.idf.get(t)
            if w is not None:
                for k in self.inverse[t]:
                    poids[k] += w
        retenue, cle_max = None, None
        for k, p in poids.items():
            if self._ecartee(k, sur_les_lots):
                continue
            i, a, b, ts = self.unites[k][:4]
            communs, score, fin = ts & q, p / total, b
            if (k + 1 < len(self.unites) and self.unites[k + 1][0] == i
                    and not self._ecartee(k + 1, sur_les_lots)):
                _, _, b2, ts2 = self.unites[k + 1][:4]
                communs2 = (ts | ts2) & q
                score2 = sum(self.idf[t] for t in communs2) / total - _MALUS_PAIRE
                if score2 > score:
                    communs, score, fin = communs2, score2, b2
            if len(communs) < _MIN_TERMES_COMMUNS or score < _MIN_RECOVER_SCORE:
                continue
            cle = (score + (_BONUS_PREFERENCE if i in preferees else 0.0), -k)
            if cle_max is None or cle > cle_max:
                cle_max, retenue = cle, (i, a, fin, score)
        return retenue


def _occurrences(texte: str, motif: str):
    k = texte.find(motif)
    while k >= 0:
        yield k
        k = texte.find(motif, k + 1)


def _ancrer(extrait: str, pieces: List[Tuple[str, str, int]], index,
            sur_les_lots: bool = False) -> Optional[Ancrage]:
    """Ancre un extrait sur la meilleure des pièces (nom, texte, rang ; le plus
    petit rang d'abord). `index()` rend l'index des phrases de ces pièces.
    Un aimant n'est jamais une source ; le tableau des lots l'est seulement si
    l'exigence porte sur les lots (`sur_les_lots`)."""
    extrait = (extrait or "").strip()
    if len(extrait) < 10:
        return None
    ordre = sorted(range(len(pieces)), key=lambda i: (pieces[i][2], pieces[i][0]))
    seulement_aimants = False

    # 1. Exact : le texte existe tel quel (première occurrence hors aimant)
    for i in ordre:
        nom, texte, _ = pieces[i]
        for k in _occurrences(texte, extrait):
            if _est_aimant(texte, k, k + len(extrait), sur_les_lots):
                seulement_aimants = True
                continue
            return Ancrage(nom, k, k + len(extrait), "exact", 1.0)

    # 2. Normalisé (apostrophes, retours à la ligne, ligatures) → passage réel
    norm = _normalize(extrait)
    if not norm:
        return None
    for i in ordre:
        nom, texte, _ = pieces[i]
        doc_norm, idx_map = _doc_index(texte)
        for p in _occurrences(doc_norm, norm):
            a, b = _sans_blancs(texte, idx_map[p], idx_map[min(p + len(norm) - 1, len(idx_map) - 1)] + 1)
            if b <= a:
                continue
            if _est_aimant(texte, a, b, sur_les_lots):
                seulement_aimants = True
                continue
            return Ancrage(nom, a, b, "normalise", 1.0)
    # Retrouvé tel quel, mais seulement dans des aimants : l'extrait EST un
    # aimant (en-tête, sommaire, tableau des lots) → pas de source.
    if seulement_aimants:
        return None

    # 2bis. Condensation « … » ou phrases recollées : le plus long morceau
    # retrouvé tel quel est étendu à la phrase réelle.
    morceaux = [s.strip() for s in _COUPE_EXTRAIT.split(extrait) if len(s.strip()) >= 20]
    for seg in sorted(morceaux, key=len, reverse=True):
        seg_norm = _normalize(seg)
        for i in ordre:
            nom, texte, _ = pieces[i]
            doc_norm, idx_map = _doc_index(texte)
            for p in _occurrences(doc_norm, seg_norm):
                s_, e_ = _expand_to_sentence(texte, idx_map[p],
                                             idx_map[min(p + len(seg_norm) - 1, len(idx_map) - 1)] + 1)
                a, b = _sans_blancs(texte, s_, e_)
                if b - a >= 20 and not _est_aimant(texte, a, b, sur_les_lots):
                    return Ancrage(nom, a, b, "segment", round(len(seg_norm) / len(norm), 3))

    # 3. Récupéré : la meilleure phrase de toutes les pièces (termes
    # significatifs : mots entiers, sans mots vides), aimants écartés
    r = index().meilleure(_termes(norm), {i for i, p in enumerate(pieces) if p[2] <= 1}, sur_les_lots)
    if r is None:
        return None
    i, a, b, score = r
    nom, texte, _ = pieces[i]
    a, b = _sans_blancs(texte, a, b)
    if b - a < 20:
        return None
    return Ancrage(nom, a, b, "recupere", round(score, 3))


_INDEX_SEUL: "OrderedDict[str, _IndexPhrases]" = OrderedDict()   # anchor_excerpt : une pièce seule


def _index_seul(texte: str) -> _IndexPhrases:
    with _cache_verrou:
        idx = _INDEX_SEUL.get(texte)
        if idx is not None:
            _INDEX_SEUL.move_to_end(texte)
            return idx
    idx = _IndexPhrases([texte])
    with _cache_verrou:
        _INDEX_SEUL[texte] = idx
        while len(_INDEX_SEUL) > 8:
            _INDEX_SEUL.popitem(last=False)
    return idx


def anchor_excerpt(excerpt: str, doc_text: str) -> Optional[str]:
    """Retourne un extrait VERBATIM du doc correspondant à l'excerpt, ou None."""
    if not doc_text:
        return None
    a = _ancrer(excerpt, [("", doc_text, 0)], lambda: _index_seul(doc_text))
    return doc_text[a.debut:a.fin] if a else None


# Textes de pages par EMPREINTE de fichier (chemin réel, taille, date) : chaque
# portée d'analyse (tronc commun, puis chaque lot) et chaque relance rouvraient
# les mêmes PDF. L'extraction du dépôt y dépose aussi les pages qu'elle vient de
# lire (retenir_pages) : l'analyse ne relit plus le PDF du tout.
# Entrée : (normalisées ?, textes des pages, TOUTES les pages, vides comprises).
_PAGES_CACHE: "OrderedDict[tuple, tuple]" = OrderedDict()
_PAGES_CACHE_MAX_CARACTERES = 8_000_000   # borné en volume, pas en nombre de fichiers


def _empreinte(chemin: str) -> Optional[tuple]:
    try:
        reel = os.path.realpath(chemin)
        st = os.stat(reel)
    except OSError:
        return None
    return (reel, st.st_size, st.st_mtime_ns)


def _ranger_pages(cle: tuple, entree: tuple) -> None:
    with _cache_verrou:
        _PAGES_CACHE[cle] = entree
        _PAGES_CACHE.move_to_end(cle)
        total = sum(sum(len(p) for p in v[1]) for v in _PAGES_CACHE.values())
        while total > _PAGES_CACHE_MAX_CARACTERES and len(_PAGES_CACHE) > 1:
            _, retiree = _PAGES_CACHE.popitem(last=False)
            total -= sum(len(p) for p in retiree[1])


def retenir_pages(chemin: str, pages: List[str]) -> None:
    """Garde les textes de TOUTES les pages d'un PDF que l'extraction vient de
    lire (mêmes appels get_text que resolve_pages) : l'ancrage les reprendra au
    lieu de rouvrir le fichier. Normalisés plus tard, seulement s'ils servent."""
    cle = _empreinte(chemin)
    if cle is not None:
        _ranger_pages(cle, (False, list(pages)))


def _pages_normalisees(chemin: str) -> List[str]:
    cle = _empreinte(chemin)
    if cle is None:
        return []
    with _cache_verrou:
        entree = _PAGES_CACHE.get(cle)
        if entree is not None:
            _PAGES_CACHE.move_to_end(cle)
    if entree is not None:
        normalisees, pages = entree
        if normalisees:
            return pages
        pages = [_normalize(p) for p in pages]
        _ranger_pages(cle, (True, pages))
        return pages
    try:
        # le lecteur de l'extraction au dépôt : mêmes pages que celles mises en cache
        pages = [_normalize(p) for p in pdf_lecture.lire_pages(chemin)]
    except Exception:
        return []
    _ranger_pages(cle, (True, pages))
    return pages


# Longueurs minimales des sondes : en dessous, trop courtes pour désigner une page.
_SONDE_NORMALISEE_MIN = 15   # caractères normalisés
_SONDE_FLUX_MIN = 12         # lettres et chiffres


def _page_contenant(sonde: str, pages: List[str], page_indiquee) -> Optional[int]:
    """La page indiquée si elle contient la sonde, sinon la première page qui la
    contient (numérotée à partir de 1), sinon None."""
    if page_indiquee and 1 <= page_indiquee <= len(pages) and sonde in pages[page_indiquee - 1]:
        return page_indiquee
    return next((n for n, texte in enumerate(pages, start=1) if sonde in texte), None)


def resolve_pages(requirements: List[dict], doc_paths: Dict[str, str]) -> int:
    """Corrige source_page : localise la page RÉELLE de chaque excerpt ancré
    (la page estimée par l'IA est souvent fausse → viewer sans surlignage).
    Une lecture du PDF par document (et par empreinte de fichier), textes de
    pages normalisés cachés."""
    page_cache: Dict[str, List[str]] = {}
    flux_cache: Dict[str, List[str]] = {}

    def _pages(key: str) -> List[str]:
        if key not in page_cache:
            page_cache[key] = _pages_normalisees(doc_paths[key])
        return page_cache[key]

    def _pages_flux(key: str) -> List[str]:
        if key not in flux_cache:
            flux_cache[key] = [_flux_normalise(p) for p in _pages(key)]
        return flux_cache[key]

    fixed = 0
    for req in requirements:
        excerpt = req.get("source_excerpt")
        if not excerpt:
            continue
        src = (req.get("source_document") or "")
        key = next((k for k in doc_paths
                    if k.lower() == src.lower() or k.lower() in src.lower()
                    or src.lower() in k.lower()), None)
        if not key:
            continue
        debut = excerpt[:120]
        current = req.get("source_page")
        page = None
        # 1. Sonde normalisée : la plus précise, elle départage deux passages
        #    presque identiques (« ; » contre « - »).
        probe = _normalize(debut)
        if len(probe) >= _SONDE_NORMALISEE_MIN:
            page = _page_contenant(probe, _pages(key), current)
        # 2. Introuvable : sonde en flux alphanumérique (plan H §2.6), insensible
        #    aux blancs. Sur les 410 extraits réels de Gueux : 399 pages trouvées
        #    avec le texte pdfium (383 avant), 401 avec le texte PyMuPDF (400).
        if page is None:
            probe = _flux(debut)
            if len(probe) >= _SONDE_FLUX_MIN:
                page = _page_contenant(probe, _pages_flux(key), current)
        if page is not None and page != current:
            req["source_page"] = page
            fixed += 1
    if fixed:
        logger.info("Ancrage : %d pages sources corrigées (page IA fausse)", fixed)
    return fixed


def _pieces_designees(source: Optional[str], noms: List[str]) -> set:
    """Pièces que désigne l'IA (« CCTP », « RC p. 4 », nom de fichier…)."""
    s = re.sub(r"\s*p\.?\s*\d+.*$", "", (source or "")).strip().lower()
    return {n for n in noms if s and (s == n.lower() or s in n.lower() or n.lower() in s)}


def anchor_requirements(requirements: List[dict], doc_texts: Dict[str, str],
                        rangs: Optional[Dict[str, int]] = None) -> List[dict]:
    """Ancre chaque exigence sur le texte réel des pièces.

    doc_texts : nom → texte des pièces que l'IA a reçues pour cette portée ;
    aucune autre pièce ne peut servir de source. rangs : 0 = pièce propre au
    lot de l'exigence, 1 = pièce commune (sans rangs : toutes au même rang).

    Toutes les pièces sont comparées (plus de « première pièce qui passe ») :
    le texte exact ou normalisé gagne, dans la pièce désignée par l'IA, sinon
    dans une pièce du lot, sinon dans une pièce commune ; à défaut, la
    meilleure phrase de toutes les pièces (score par phrase). source_excerpt
    devient un verbatim garanti, ou None (pas de bouton source) ; source_document
    est CORRIGÉ vers la pièce où l'extrait existe réellement."""
    counts = {"exact_ou_reancre": 0, "recupere": 0, "invalide": 0}
    rangs = rangs or {}
    noms = sorted((n for n, t in doc_texts.items() if t), key=lambda n: (rangs.get(n, 0), n))
    textes = [doc_texts[n] for n in noms]
    index_partage: List[_IndexPhrases] = []

    def _index() -> _IndexPhrases:
        if not index_partage:
            index_partage.append(_IndexPhrases(textes))
        return index_partage[0]

    for req in requirements:
        original = (req.get("source_excerpt") or "").strip()
        designees = _pieces_designees(req.get("source_document"), noms)
        pieces = [(n, t, 0 if n in designees else 1 + rangs.get(n, 0)) for n, t in zip(noms, textes)]
        sur_les_lots = bool(_SUR_LES_LOTS.search(_normalize(req.get("exigence") or "")))
        ancrage = _ancrer(original, pieces, _index, sur_les_lots)
        if ancrage is None:
            counts["invalide"] += 1
            req["source_excerpt"] = None
            continue
        counts["exact_ou_reancre" if ancrage.niveau in ("exact", "normalise") else "recupere"] += 1
        req["source_excerpt"] = doc_texts[ancrage.piece][ancrage.debut:ancrage.fin][:600]
        # Corrige la pièce source si l'extrait vit ailleurs que désigné
        if ancrage.piece.lower() not in (req.get("source_document") or "").lower():
            req["source_document"] = ancrage.piece

    total = max(len(requirements), 1)
    valid = counts["exact_ou_reancre"] + counts["recupere"]
    logger.info(
        "Ancrage des sources : %d/%d ancrées (%.0f%%) — %d exactes/ré-ancrées, "
        "%d récupérées par termes clés, %d invalides (sans bouton source)",
        valid, total, valid / total * 100,
        counts["exact_ou_reancre"], counts["recupere"], counts["invalide"],
    )
    return requirements
