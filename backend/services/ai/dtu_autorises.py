"""DTU autorisés dans le mémoire — lus SANS IA dans le DCE.

Décision du 26/10 : le mémoire ne cite un DTU que s'il figure dans le CCTP du
lot choisi ou dans les pièces communes (lot 00). Un DTU trouvé seulement
ailleurs (RC, CCTP d'un autre lot, référentiel des skills, connaissance
générale du modèle) n'est pas cité.

Décision de Mohamed du 27/10 (DEC-1) : une pièce du lot 00 (annexe aux
prescriptions communes, souvent un catalogue de tous les corps de métier) est
découpée par article ; un article n'autorise ses DTU que s'il est rattaché au
lot choisi avec certitude. Article ambigu, sans titre, ou pièce non découpable :
ses DTU ne sont pas autorisés, le mémoire ne cite que ceux du CCTP du lot.

Une seule règle partout où l'IA écrit le mémoire (DEC-2, décision du 27/10) :
`regle_dtu` est le point d'entrée unique, utilisé par le générateur et par la
réécriture de paragraphe (consigne dans le prompt + garde-fou déterministe).

Ce module est pur : il lit du texte, ne touche ni la base ni le réseau, et ne
journalise aucun extrait du DCE. Tous les motifs sont bornés (espaces ≤ 3, pas
de quantificateur imbriqué) : temps linéaire, pas de ReDoS.
"""
from __future__ import annotations

import re
import unicodedata
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
    r"(?P<sep>\s{0,3}(?:,|;|/|&|\bet\b|\bou\b)\s{0,3})"
    r"(?P<item>(?:(?:NF\s{0,3})?D\.?T\.?U\.?\s{0,3})?(?P<num>\d{2}[.\-]\d{1,2})(?![0-9]))",
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
    debut_sep: int = -1            # début du séparateur qui précède (énumération)


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
            mentions.append(MentionDtu(_canon(s.group("num")), s.start("item"), s.end(), None, False, s.start("sep")))
            fin = s.end()
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


# ── Découpe par article et rattachement au lot (DEC-1, décision du 27/10) ───
@dataclass(frozen=True)
class LotCible:
    """Le lot du mémoire : son numéro normalisé (« 5 »), sa désignation
    (« Revêtement de façade – ITE », sans « Lot 05 — »), celles des autres lots et les
    titres des CCTP des lots (pour départager une désignation partagée)."""
    numero: str
    designation: str = ""
    autres: tuple[tuple[str, str], ...] = ()
    cctp: tuple[tuple[str, str], ...] = ()   # (numéro de lot, titre de son CCTP) des CCTP connus


@dataclass(frozen=True)
class Article:
    titre: Optional[str]   # None : sans titre exploitable (ou entrée de sommaire)
    debut: int
    fin: int


_LOT_NOM = re.compile(
    r"^\s{0,3}lot\s{0,3}(?:n°\s{0,2})?0*(?P<num>\d{1,2}[a-z]?)\b\s{0,3}[—–:\-]?\s{0,3}(?P<des>[^\n]{0,200})$",
    re.IGNORECASE)
_MAJ = "A-ZÉÈÊËÀÂÎÏÔÛÙÇŒ"
# Niveau 1 : « ARTICLE 4 », « ART. 4 – FAÇADES », « Article 4.2 : ... ».
_ART_TETE = re.compile(
    r"^[ \t]{0,6}(?:ARTICLE|ART\.?)[ \t]{0,3}(?:n°[ \t]{0,2})?\d{1,3}(?:\.\d{1,2}){0,2}[ \t]{0,3}"
    r"(?:[-–—:.)][ \t]{0,3})?(?P<titre>[^\n]{0,120})$", re.IGNORECASE | re.MULTILINE)
# Niveau 2 : ligne de titre de lot (« LOT 05 – FAÇADES », « LOT GROS ŒUVRE »).
_LOT_TITRE = re.compile(r"^[ \t]{0,6}(?:LOT|Lot)\b[^\n]{1,100}$", re.MULTILINE)
# Niveau 3 : titre numéroté en majuscules (« 3. FAÇADES ET ITE »).
_NUM_TITRE = re.compile(
    rf"^[ \t]{{0,6}}\d{{1,2}}(?:\.\d{{1,2}}){{0,2}}[ \t]{{0,2}}[-–—.)]?[ \t]{{1,3}}"
    rf"[{_MAJ}][{_MAJ}0-9 '’\-–/,&()+]{{2,80}}$", re.MULTILINE)
_POINTILLES = re.compile(r"\.{4,}|…{2,}|(?:\. ){4,}")


def _titre_propre(brut: str) -> Optional[str]:
    """Titre exploitable, ou None : vide, entrée de sommaire (points de conduite),
    ligne de prose (point final, trop longue) ou marqueur de page."""
    t = (brut or "").strip()
    if not t or _POINTILLES.search(t) or _PAGE.search(t):
        return None
    if len(t) > 100 or len(t.split()) > 12 or t[-1] in ".;:,":
        return None
    if re.match(r"(?:POSTE|ARTICLE|ART\.)\b", t, re.IGNORECASE):
        return None
    return t


def _ligne_suivante(texte: str, pos: int) -> Optional[str]:
    """Première ligne non vide après `pos` (les marqueurs de page sont sautés)."""
    for ligne in texte[pos + 1:pos + 400].split("\n"):
        ligne = ligne.strip()
        if ligne and not _PAGE.search(ligne):
            return ligne
    return None


def decouper_articles(texte: str) -> list[Article]:
    """Découpe une pièce en articles, du plus fiable au moins fiable : « ARTICLE N »
    / « ART. N » ; à défaut, lignes « LOT … » ; à défaut, titres numérotés en
    majuscules. Un seul niveau est retenu (les sous-titres d'un article ne le
    coupent pas). Le texte avant le premier titre n'est dans aucun article.
    Pièce sans titre reconnaissable : liste vide (non découpable)."""
    if not texte:
        return []
    tetes: list[tuple[int, Optional[str]]] = []   # (début, titre)
    for m in _ART_TETE.finditer(texte):
        reste = m.group("titre")
        if reste.strip():
            titre = _titre_propre(reste)
        elif _POINTILLES.search(reste):
            titre = None
        else:
            titre = _titre_propre(_ligne_suivante(texte, m.end()) or "")
        tetes.append((m.start(), titre))
    if not tetes:
        for m in _LOT_TITRE.finditer(texte):
            tetes.append((m.start(), _titre_propre(m.group(0))))
    if not tetes:
        for m in _NUM_TITRE.finditer(texte):
            tetes.append((m.start(), _titre_propre(m.group(0))))
    return [Article(t, d, tetes[i + 1][0] if i + 1 < len(tetes) else len(texte))
            for i, (d, t) in enumerate(tetes)]


_MOTS_VIDES = frozenset({
    "le", "la", "les", "l", "un", "une", "de", "du", "des", "d", "et", "ou", "en", "au", "aux", "a",
    "lot", "lots", "travaux", "ouvrages", "article", "art", "poste", "n", "no",
})


# Sigles courants des lots du BTP (décision de Mohamed du 27/10) : la formule
# entière et son sigle deviennent le même mot, dans le titre de l'article comme
# dans la désignation du lot (l'équivalence joue donc dans les deux sens). Une
# formule partielle ne compte pas : « chauffage ventilation » n'est pas « CVC »
# (climatisation absente). Motifs bornés, sans quantificateur imbriqué.
# Sources (expansion du sigle ; aucun glossaire FFB/CAPEB/AQC/OPPBTP ne les
# donne tous, voir le commit) :
#   VRD : France Compétences, fiche RNCP 38080 « TP - Maçon en voirie et
#         réseaux divers » (« maçon VRD ») ; AQC, fiche Interfaces A03 « Lot VRD ».
#   CVC : OQLF, Grand dictionnaire terminologique (2014), « système de
#         chauffage, de ventilation et de climatisation » → « système CVC ».
#   TCE : Légifrance, avis sur les index du bâtiment (JORFTEXT000044213303),
#         index BT01 « Tous corps d'état » ; AQC, fiche Interfaces A03 « lots TCE ».
#   CFO / CFA : FFB, rubrique « Électricité – Courant fort – Courant faible »
#         pour les deux familles de travaux ; les sigles CFO et CFA eux-mêmes ne
#         figurent que dans l'usage du métier (aucun texte d'organisme trouvé).
#   GO  : « gros œuvre » (CSTB, guide « Gros œuvre ») ; le sigle « GO » lui-même
#         vient de la décision de Mohamed et des DCE (aucun glossaire trouvé).
_SIGLES = (
    (re.compile(r"\bgros oeuvre\b"), "go"),
    (re.compile(r"\bchauffage ventilation (?:et )?climatisation\b"), "cvc"),
    (re.compile(r"\bvoiries? (?:et )?reseaux? divers\b"), "vrd"),
    (re.compile(r"\bcourants? forts?\b"), "cfo"),
    (re.compile(r"\bcourants? faibles?\b"), "cfa"),
    (re.compile(r"\btous? corps d etat\b"), "tce"),
)
_POINTS_DE_SIGLE = re.compile(r"\b(?:[a-z]\.){2,3}(?![a-z])")   # « V.R.D. » → « vrd »


def _mots(texte: str) -> frozenset[str]:
    """Mots significatifs, sans accents ni casse, au singulier approché (« s » final retiré).
    Les formules à sigle (« gros œuvre » = « GO »…) sont ramenées au sigle."""
    t = unicodedata.normalize("NFKD", texte.lower().replace("œ", "oe").replace("æ", "ae"))
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = _POINTS_DE_SIGLE.sub(lambda m: m.group(0).replace(".", ""), t)
    t = " " + " ".join(re.findall(r"[a-z0-9]+", t)) + " "
    for motif, sigle in _SIGLES:
        t = motif.sub(sigle, t)
    mots = set()
    for w in t.split():
        if w in _MOTS_VIDES or w.isdigit():
            continue
        mots.add(w[:-1] if len(w) > 3 and w.endswith("s") else w)
    return frozenset(mots)


_NUMEROS_TITRE = re.compile(r"(?<![A-Za-z0-9])0*(\d{1,2}[a-z]?)(?![A-Za-z0-9])", re.IGNORECASE)
_NUMEROTATION = re.compile(r"^\d{1,2}(?:\.\d{1,2}){0,2}[ \t]{0,2}[-–—.)]?[ \t]{1,3}")


def rattache_article(titre: Optional[str], lot: LotCible) -> bool:
    """Le titre de l'article désigne-t-il le lot choisi AVEC CERTITUDE ?

    Oui si : (a) il nomme le numéro du lot (« LOT 05 ») et aucun autre numéro ; ou
    (b) tous ses mots significatifs sont des mots de la désignation du lot
    (mots entiers) ET ne sont pas tous aussi ceux de la désignation d'un autre
    lot. Sans titre, mot hors désignation, deux lots nommés, désignation
    partagée : non, sauf si le titre du CCTP d'un seul des lots qui la partagent la
    reprend (`_depart_par_cctp`). Les sigles (GO, CVC, VRD, CFO, CFA, TCE) valent leur formule
    entière ; un lot TCE unique couvre tous les articles titrés, mais « TCE » seul
    dans un titre ne rattache à aucun lot de métier."""
    if not titre:
        return False
    t = titre.strip()
    if re.match(r"LOT\b", t, re.IGNORECASE):
        nums = {_normalize_lot_num(n) for n in _NUMEROS_TITRE.findall(t)}
        if nums:
            return nums == {_normalize_lot_num(lot.numero)}
    else:
        t = _NUMEROTATION.sub("", t)   # « 3. FAÇADES » : 3 numérote le titre, ce n'est pas un lot
    mots_titre = _mots(t)
    mots_lot = _mots(lot.designation)
    if "tce" in mots_lot and not lot.autres:
        # Lot « tous corps d'état » unique du projet : il couvre tous les métiers,
        # donc tout article titré lui appartient.
        return bool(mots_titre)
    if mots_titre == {"tce"}:
        return False   # « TCE » seul ne nomme aucun métier : jamais de rattachement
    if not mots_titre or not mots_titre <= mots_lot:
        return False
    partageurs = [n for n, des in lot.autres if mots_titre <= _mots(des)]
    return not partageurs or _depart_par_cctp(mots_titre, lot, partageurs)


def _depart_par_cctp(mots_titre: frozenset[str], lot: LotCible, partageurs: list[str]) -> bool:
    """Désignation partagée par plusieurs lots (« menuiseries extérieures » : PVC et
    alu). Décision du 27/10 : l'article est au lot choisi si, parmi les lots qui
    partagent ces mots, le CCTP du lot choisi est le SEUL dont le titre les dit.
    Il faut connaître un CCTP pour chacun de ces lots : sinon on ne peut pas dire
    que l'autre ne les dit pas, et rien ne change."""
    candidats = {_normalize_lot_num(lot.numero)} | {_normalize_lot_num(n) for n in partageurs}
    titres: dict[str, list[str]] = {}
    for n, titre in lot.cctp:
        titres.setdefault(_normalize_lot_num(n), []).append(titre)
    if any(c not in titres for c in candidats):
        return False
    disent = {c for c in candidats if any(mots_titre <= _mots(t) for t in titres[c])}
    return disent == {_normalize_lot_num(lot.numero)}


def titre_cctp(texte: str, numero: str) -> Optional[str]:
    """Titre d'un CCTP de lot, lu en tête de pièce : la ligne « LOT 03 : MENUISERIES
    EXTÉRIEURES PVC » (si elle nomme ce lot), sinon l'en-tête de la première ligne
    (« 03 – MENUISERIES EXTÉRIEURES PVC / projet / indice »). None si illisible."""
    lignes = [l.strip() for l in (texte or "")[:4000].split("\n") if l.strip()][:40]
    for l in lignes:
        m = _LOT_NOM.match(l)
        if m and _normalize_lot_num(m.group("num")) == _normalize_lot_num(numero) and m.group("des").strip():
            return m.group("des").strip()
    if lignes and not _LOT_NOM.match(lignes[0]):   # une ligne « LOT n » d'un autre lot n'est pas un en-tête
        tete = _NUMEROTATION.sub("", lignes[0].split(" / ")[0].strip(), count=1).strip()
        if tete and len(tete) <= 100:
            return tete
    return None


def titres_cctp(docs: Iterable) -> tuple[tuple[str, str], ...]:
    """(numéro de lot, titre) de chaque CCTP rattaché à UN SEUL lot numéroté.
    `docs` doit être la liste complète du projet (avant le filtre par lot)."""
    res = []
    for d in docs:
        if getattr(d, "type", None) != "cctp" or not getattr(d, "extracted_text", None):
            continue
        tags = {_normalize_lot_num(str(t)) for t in (getattr(d, "related_lots", None) or [])}
        if len(tags) != 1:
            continue
        num = next(iter(tags))
        if not re.fullmatch(r"\d{1,2}[a-z]?", num) or num == "0":
            continue
        titre = titre_cctp(d.extracted_text, num)
        if titre:
            res.append((num, titre))
    return tuple(res)


def lot_cible(selected_lot: Optional[str], lot_nom: Optional[str] = None,
              lots_detectes=None, cctp: tuple = ()) -> Optional[LotCible]:
    """Le lot du mémoire d'après son identifiant (« lot5 »), son nom
    (« Lot 05 — Revêtement de façade – ITE ») et la liste des lots du projet."""
    des, num = "", ""
    m = _LOT_NOM.match(lot_nom or "")
    if m:
        num, des = _normalize_lot_num(m.group("num")), m.group("des").strip()
    if selected_lot:
        num = _normalize_lot_num(selected_lot)
    if not num:
        return None
    autres = []
    for l in lots_detectes or []:
        if not isinstance(l, dict):
            continue
        mm = _LOT_NOM.match(l.get("nom") or "")
        n = _normalize_lot_num(mm.group("num")) if mm else _normalize_lot_num(str(l.get("id") or ""))
        d = mm.group("des").strip() if mm else ""
        if n == num:
            des = des or d
        elif n:
            autres.append((n, d))
    return LotCible(num, des, tuple(autres), tuple(cctp))


def _plages_du_lot(texte: str, lot: Optional[LotCible]) -> list[tuple[int, int]]:
    """Plages d'une pièce du lot 00 qui appartiennent à un article rattaché au lot."""
    if lot is None:
        return []
    return [(a.debut, a.fin) for a in decouper_articles(texte) if rattache_article(a.titre, lot)]


def dtu_autorises(docs: Iterable, selected_lot: Optional[str] = None,
                  lots_du_rc=None, *, lot_nom: Optional[str] = None,
                  lots_detectes=None, deja_filtre: bool = False) -> dict[str, DtuAutorise]:
    """{numéro canonique → DtuAutorise} lu dans les pièces autorisées.

    Le CCTP du lot garde tous ses DTU. Une pièce du lot 00 (quel que soit son
    type) n'en donne que dans les articles rattachés avec certitude au lot
    (`rattache_article`, décision du 27/10) ; sans lot connu, elle n'en donne aucun.

    Avec `selected_lot` (« lot5 »…), les pièces des autres lots sont écartées ici
    même (get_documents_for_lot) sauf si `deja_filtre` ; sans lui, `docs` doit
    déjà être filtré. `lot_nom` et `lots_detectes` servent au rattachement.

    La page vient des marqueurs « Page N / M » que la pièce porte dans son
    texte extrait ; sans marqueur, la page vaut None (le texte extrait ne porte
    pas de saut de page)."""
    res: dict[str, DtuAutorise] = {}
    docs = list(docs)
    # Titres des CCTP de TOUS les lots (avant le filtre) : ils départagent une
    # désignation partagée. Pièces déjà filtrées : les autres lots sont inconnus,
    # donc aucun départage.
    cctp = () if deja_filtre else titres_cctp(docs)
    if selected_lot and not deja_filtre:
        docs = get_documents_for_lot(docs, selected_lot, lots_du_rc)
    lot = lot_cible(selected_lot, lot_nom, lots_detectes, cctp)
    for d in _pieces_sources(docs):
        texte = d.extracted_text
        mentions = trouver_dtu(texte)
        if not mentions:
            continue
        if _est_lot_zero(getattr(d, "related_lots", None)):
            plages = _plages_du_lot(texte, lot)
            mentions = [m for m in mentions if any(a <= m.debut < b for a, b in plages)]
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
    entete = "━━━ LISTE DES DTU AUTORISÉS (CCTP du lot + articles du lot des pièces communes) ━━━\n"
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


# ── Garde-fou après génération ───────────────────────────────────────────────
# Article (ou préposition) qui précède la mention, et mot « norme » éventuel.
_AVANT = re.compile(
    r"(?:(?<![\wÀ-ÿ])(?P<art>à la|au|aux|à|du|des|de la|de|le|les|la)\s{1,3})?(?:normes?\s{1,3})?$",
    re.IGNORECASE,
)
_PAREN_SUIVANTE = re.compile(r"\s{0,2}\([^()\n]{0,80}\)")
_REGLES = "règles de l'art"
# « **NF DTU 42.1** — réfection de façades ; » : puce qui ne parle que de ce DTU.
_GLOSE = re.compile(r"\*\*\s{0,2}[—–-]\s{0,2}[^;\n|]{1,160}")
_SEP_AVANT = re.compile(r"[;,]\s{0,3}$")
_SEP_APRES = re.compile(r"\s{0,3};")
_FIN_ITEM = re.compile(r"\s{0,3}(?:\||,|;|\.|\)|\n|$)")
_PUCE_VIDE = re.compile(r"(?m)^[ \t]*[-*•][ \t]*\n")
_DOUBLON = re.compile(
    r"((?:aux |des |les )?règles de l'art)(?:\s*(?:,|;|et|ou)\s+(?:aux |des |les )?règles de l'art)+")


def _groupes(mentions: list[MentionDtu]) -> list[list[MentionDtu]]:
    groupes: list[list[MentionDtu]] = []
    for men in mentions:
        if men.tete or not groupes:
            groupes.append([men])
        else:
            groupes[-1].append(men)
    return groupes


def _phrase(texte: str, debut: int) -> tuple[int, str]:
    """(début de la zone à remplacer, expression de remplacement) d'après ce qui
    précède la mention : « conformément au NF DTU x » → « conformément aux règles de l'art »."""
    fenetre = texte[max(0, debut - 30):debut]
    m = _AVANT.search(fenetre)
    art = (m.group("art") or "").lower() if m else ""
    zone = debut - (len(fenetre) - m.start()) if m else debut
    if art in ("au", "aux", "à", "à la"):
        return zone, f"aux {_REGLES}"
    if art in ("du", "des", "de", "de la"):
        return zone, f"des {_REGLES}"
    if art in ("le", "les", "la"):
        return zone, f"les {_REGLES}"
    avant = texte[:debut].rstrip(" \t")
    if not avant or avant[-1] in "|:;(•-*\n":
        return debut, _REGLES
    return debut, f"les {_REGLES}"


def retire_dtu_non_autorises(texte: str, autorises: set[str]) -> tuple[str, list[str]]:
    """Retire du texte tout DTU hors de `autorises` (numéros canoniques).

    Jamais remplacé par un autre DTU : « conforme au NF DTU 52.2 » devient
    « conforme aux règles de l'art », « (NF DTU 52.2) » disparaît, un DTU d'une
    liste est enlevé de la liste. Retourne (texte, numéros retirés dans l'ordre)."""
    if not texte:
        return texte, []
    mentions = trouver_dtu(texte)
    if not any(men.numero not in autorises for men in mentions):
        return texte, []
    retires: list[str] = []
    morceaux: list[str] = []
    curseur = 0
    for g in _groupes(mentions):
        sortants = [x for x in g if x.numero not in autorises]
        if not sortants:
            continue
        retires.extend(x.numero for x in sortants)
        debut, fin = g[0].debut, g[-1].fin
        if len(sortants) < len(g):
            # Liste mixte : on garde les DTU autorisés, avec leurs séparateurs.
            neuf = ""
            for x in g:
                if x.numero not in autorises:
                    continue
                item = texte[x.debut:x.fin]
                if not neuf:   # le premier DTU gardé devient la tête de la liste
                    neuf = item if (x.tete or re.search(r"D\.?T\.?U", item, re.IGNORECASE)) else f"NF DTU {item}"
                else:
                    neuf += texte[x.debut_sep:x.debut] + item if not x.tete else item
            # Un commentaire entre parenthèses collé au DTU retiré en fin de liste le suivait.
            if g[-1].numero not in autorises:
                p = _PAREN_SUIVANTE.match(texte, fin)
                if p:
                    fin = p.end()
            morceaux.append(texte[curseur:debut])
            morceaux.append(neuf)
            curseur = fin
            continue
        # Groupe entièrement retiré.
        if (texte[max(0, debut - 8):debut].rstrip(" \t").endswith("(") and texte[fin:fin + 3].lstrip(" \t").startswith(")")):
            ouvre = texte.rfind("(", max(0, debut - 8), debut)
            ferme = texte.find(")", fin, fin + 4)
            zone = ouvre
            while zone > curseur and texte[zone - 1] in " \t":
                zone -= 1
            morceaux.append(texte[curseur:zone])
            curseur = ferme + 1
            continue
        # Puce en gras avec glose : on enlève toute la puce (et son « ; »).
        g1 = _GLOSE.match(texte, fin)
        if g1 and texte[max(0, debut - 2):debut] == "**" and debut - 2 >= curseur:
            deb, fin2 = debut - 2, g1.end()
            sep = _SEP_AVANT.search(texte[max(curseur, deb - 6):deb])
            if sep:
                deb -= len(sep.group(0))
            else:
                s2 = _SEP_APRES.match(texte, fin2)
                if s2:
                    fin2 = s2.end()
            morceaux.append(texte[curseur:deb])
            curseur = fin2
            continue
        # Élément d'une liste (cellule, énumération) : on l'enlève avec sa virgule.
        sep = _SEP_AVANT.search(texte[max(curseur, debut - 6):debut])
        if sep and _FIN_ITEM.match(texte, fin):
            p = _PAREN_SUIVANTE.match(texte, fin)
            morceaux.append(texte[curseur:debut - len(sep.group(0))])
            curseur = p.end() if p else fin
            continue
        zone, expr = _phrase(texte, debut)
        zone = max(zone, curseur)
        morceaux.append(texte[curseur:zone])
        morceaux.append(expr)
        curseur = fin
    morceaux.append(texte[curseur:])
    out = "".join(morceaux)
    if any(_REGLES in x for x in morceaux):
        out = _DOUBLON.sub(lambda mm: mm.group(1), out)
    out = _PUCE_VIDE.sub("", out)
    return out, retires


def appliquer_garde_dtu(contenu: dict, autorises: set[str]) -> dict:
    """Applique le garde-fou à tout le texte du mémoire (clés « _… » ignorées).

    Modifie `contenu` en place. Retourne la trace pour `_generation_meta["dtu"]` :
    numéros seulement, aucun extrait de texte."""
    retires: list[str] = []

    def _visite(o):
        if isinstance(o, str):
            neuf, r = retire_dtu_non_autorises(o, autorises)
            retires.extend(r)
            return neuf
        if isinstance(o, dict):
            return {k: (v if str(k).startswith("_") else _visite(v)) for k, v in o.items()}
        if isinstance(o, list):
            return [_visite(v) for v in o]
        return o

    for k in list(contenu):
        if not str(k).startswith("_"):
            contenu[k] = _visite(contenu[k])
    return {"autorises": sorted(autorises, key=_cle_numero), "retraits": len(retires),
            "retires": sorted(set(retires), key=_cle_numero)}


# ── Point d'entrée unique (DEC-2, décision de Mohamed du 27/10) ─────────────
@dataclass(frozen=True)
class RegleDtu:
    """La règle DTU d'un mémoire : la liste fermée des DTU citables, la consigne qui
    la donne au modèle et le garde-fou déterministe sur sa sortie. Utilisée par le
    générateur ET par la réécriture de paragraphe : une seule règle."""
    autorises: dict

    def numeros(self) -> set[str]:
        return set(self.autorises)

    def consigne(self) -> str:
        return formater_liste_dtu(self.autorises)

    def garde_texte(self, texte: str) -> tuple[str, list[str]]:
        """(texte sans DTU hors liste, numéros retirés)."""
        return retire_dtu_non_autorises(texte, self.numeros())

    def garde_contenu(self, contenu: dict) -> dict:
        """Garde-fou sur tout un mémoire (en place) ; trace = numéros seulement."""
        return appliquer_garde_dtu(contenu, self.numeros())


def regle_dtu(docs: Iterable, selected_lot: Optional[str] = None,
              selected_lot_name: Optional[str] = None, lots_detectes=None,
              lots_du_rc=None, deja_filtre: bool = False) -> RegleDtu:
    """La règle DTU du lot choisi, lue sans IA dans `docs` (voir `dtu_autorises`)."""
    return RegleDtu(dtu_autorises(docs, selected_lot, lots_du_rc, lot_nom=selected_lot_name,
                                  lots_detectes=lots_detectes, deja_filtre=deja_filtre))
