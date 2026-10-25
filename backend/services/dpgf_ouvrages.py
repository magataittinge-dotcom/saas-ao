"""Ouvrages du lot, lus sans IA dans la DPGF de l'acheteur (B2).

Décision de Mohamed (25/10/2026) : « AE oui. DPGF : jamais le tableur brut à
l'IA, et jamais une colonne de prix ou de montant. Synorix extrait sans IA la
liste des ouvrages du lot (désignation, unité, quantité si l'acheteur la
donne), plafonnée à environ 300 lignes, et seule cette liste courte part en
passe 2 : le mémoire et le planning suivent ainsi les ouvrages du lot. La DPGF
chiffrée par l'entreprise ne part jamais à l'IA. Sa conformité de forme reste
vérifiée sans IA. »

Ce module ne lit que trois colonnes, repérées par l'en-tête du tableau :
désignation, unité, quantité. Une colonne de prix, de montant, de total ou de
TVA n'est jamais lue ; un montant écrit dans une désignation est retiré. Sans
en-tête reconnu, rien n'est extrait (jamais de devinette). Formats : xlsx,
xlsm, xls, ods, csv. Le PDF n'est pas lu : sans repérage fiable des colonnes,
une valeur de prix pourrait passer.

Lecture bloquante (tableurs) : à appeler hors de la boucle d'événements.
"""
from __future__ import annotations

import csv
import io
import logging
import re
import unicodedata
import zipfile
from itertools import chain, islice
from pathlib import Path
from typing import Iterable, Iterator, List, Optional, Sequence, Tuple

from models.project import TYPE_DPGF
from services.garde_archives import controler_tableur
from services.document_tagger import get_documents_for_lot

logger = logging.getLogger(__name__)

TITRE = "Ouvrages du lot — DPGF de l'acheteur"
MAX_LIGNES = 300
EXTENSIONS_TABLEUR = (".xlsx", ".xlsm", ".xls", ".ods", ".csv")

_ZONE_ENTETE = 40        # l'en-tête est cherché dans les 40 premières lignes
_ZONE_LUE = 80           # lignes gardées pour deviner la colonne des désignations
_MAX_COLONNES = 64       # colonnes lues par ligne
_MAX_DESIGNATION = 200   # caractères gardés par désignation
_MAX_CSV = 20 * 1024 * 1024
_MAX_LIGNES_ODS = 20_000  # par onglet : les lignes répétées d'un .ods sont bornées

# En-têtes (texte normalisé : minuscules, sans accents ni ponctuation).
_QUANTITE = re.compile(r"^(?:q|qt|qte|qtes|qtite|quant|nb|nombre)\b|^quantit")
_UNITE = re.compile(r"^(?:u|un|ut|unt|unit|unite|unites)$")
_PRIX = re.compile(
    r"€|\b(?:prix|pu|pt|p u|p t|montant|montants|total|totaux|tva|ht|ttc|cout|couts"
    r"|valeur|somme|euro|euros|eur|mt)\b")
_DESIGNATION = re.compile(
    r"\b(?:designation|designations|descriptif|description|libelle|libelles|intitule"
    r"|ouvrage|ouvrages|prestation|prestations|nature)\b")
_TITRE_LOT = re.compile(r"\blot\s*(?:n\s*)?(?:o\s*)?(\d{1,2}[a-z]?)\b")
# Lignes de calcul, sans ouvrage : « Sous total H.T. », « TOTAL LOT 05 », « TVA 20 % »…
# (« Montant » seul reste un ouvrage : c'est aussi le profilé d'une cloison.)
_LIGNE_DE_TOTAL = re.compile(
    r"^(?:sous total|total|totaux|tva|report|a reporter|net a payer|prix global"
    r"|recapitulatif|recap|montant (?:total|global|ht|ttc|du lot|des travaux))\b")
# Valeur monétaire écrite dans une désignation : « 2 500,00 € HT », « € 300 », « 12 k€ ».
_MONTANT = re.compile(
    r"\d[\d   .,']*\s?(?:k€|m€|€|eur\b|euros?\b)|€\s?\d[\d   .,']*",
    re.IGNORECASE)
_MONTANT_RETIRE = "(montant retiré)"


def est_tableur(nom_fichier: str) -> bool:
    return (nom_fichier or "").lower().endswith(EXTENSIONS_TABLEUR)


def cle_lot(lot: Optional[str]) -> Optional[str]:
    """« lot05 », « Lot 5 », « 05 » → « 5 » ; « lot01a » → « 1a » ; « all » → None."""
    s = re.sub(r"^lot[\s_\-]*", "", (lot or "").strip().lower())
    if not s or s == "all":
        return None
    return re.sub(r"^0+(?=\d)", "", s)


def _norm(valeur) -> str:
    texte = unicodedata.normalize("NFKD", str(valeur))
    texte = "".join(c for c in texte if not unicodedata.combining(c)).lower()
    return " ".join(re.sub(r"[^a-z0-9€]+", " ", texte).split())


# ─── Lecture des onglets : (nom, lignes de valeurs) ─────────────────────────────

def _onglets(chemin: Path) -> Iterator[Tuple[str, Iterator[Sequence]]]:
    suffixe = chemin.suffix.lower()
    if suffixe != ".csv":
        controler_tableur(chemin)   # bombe de décompression : jamais ouverte
    if suffixe in (".xlsx", ".xlsm"):
        yield from _onglets_xlsx(chemin)
    elif suffixe == ".xls":
        yield from _onglets_xls(chemin)
    elif suffixe == ".ods":
        yield from _onglets_ods(chemin)
    elif suffixe == ".csv":
        yield from _onglets_csv(chemin)


def _onglets_xlsx(chemin: Path):
    import openpyxl

    classeur = openpyxl.load_workbook(str(chemin), read_only=True, data_only=True)
    try:
        for feuille in classeur.worksheets:
            yield feuille.title, feuille.iter_rows(values_only=True)
    finally:
        classeur.close()


def _onglets_xls(chemin: Path):
    import xlrd

    try:
        classeur = xlrd.open_workbook(str(chemin), on_demand=True)
    except xlrd.biffh.XLRDError:
        if zipfile.is_zipfile(chemin):   # un .xlsx renommé en .xls
            yield from _onglets_xlsx(chemin)
            return
        raise
    try:
        for i in range(classeur.nsheets):
            feuille = classeur.sheet_by_index(i)
            yield feuille.name, (feuille.row_values(r) for r in range(feuille.nrows))
            classeur.unload_sheet(i)
    finally:
        classeur.release_resources()


_ODS_T = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"
_ODS_O = "{urn:oasis:names:tc:opendocument:xmlns:office:1.0}"
_ODS_P = "{urn:oasis:names:tc:opendocument:xmlns:text:1.0}p"


def _entier(texte, defaut: int = 1) -> int:
    try:
        return max(int(texte), 0)
    except (TypeError, ValueError):
        return defaut


def _onglets_ods(chemin: Path):
    """Lecture directe de content.xml (sans odfpy) : ligne par ligne, mémoire bornée."""
    from lxml import etree

    with zipfile.ZipFile(chemin) as archive, archive.open("content.xml") as flux:
        nom, lignes = None, []
        for evenement, el in etree.iterparse(
                flux, events=("start", "end"), tag=(_ODS_T + "table", _ODS_T + "table-row"),
                resolve_entities=False, no_network=True, load_dtd=False):
            if el.tag == _ODS_T + "table":
                if evenement == "start":
                    nom, lignes = el.get(_ODS_T + "name") or "", []
                else:
                    yield nom, iter(lignes)
                    nom, lignes = None, []
                    el.clear()
                continue
            if evenement != "end" or nom is None:
                continue
            valeurs = _ligne_ods(el)
            place = _MAX_LIGNES_ODS - len(lignes)
            if place > 0:
                if any(v not in (None, "") for v in valeurs):
                    repetitions = _entier(el.get(_ODS_T + "number-rows-repeated"))
                    lignes.extend([valeurs] * min(repetitions, place))
                else:
                    lignes.append([])   # une ligne vide suffit, même répétée
            el.clear()
            parent = el.getparent()
            while parent is not None and el.getprevious() is not None:
                del parent[0]


def _ligne_ods(ligne) -> list:
    valeurs: list = []
    for cellule in ligne:
        if cellule.tag not in (_ODS_T + "table-cell", _ODS_T + "covered-table-cell"):
            continue
        valeur = None
        if cellule.get(_ODS_O + "value-type") in ("float", "percentage", "currency"):
            try:
                valeur = float(cellule.get(_ODS_O + "value"))
            except (TypeError, ValueError):
                valeur = None
        if valeur is None:
            valeur = "\n".join("".join(p.itertext()) for p in cellule.iter(_ODS_P)) or None
        repetitions = _entier(cellule.get(_ODS_T + "number-columns-repeated"))
        valeurs.extend([valeur] * min(repetitions, _MAX_COLONNES - len(valeurs)))
        if len(valeurs) >= _MAX_COLONNES:
            break
    return valeurs


def _onglets_csv(chemin: Path):
    with open(chemin, "rb") as f:
        brut = f.read(_MAX_CSV)
    for codage in ("utf-8-sig", "cp1252"):
        try:
            texte = brut.decode(codage)
            break
        except UnicodeDecodeError:
            continue
    debut = "\n".join(texte.split("\n", 10)[:10])
    separateur = max(";,\t", key=debut.count)
    yield chemin.stem, csv.reader(io.StringIO(texte), delimiter=separateur)


# ─── En-tête et colonnes ────────────────────────────────────────────────────────

def _nature(valeur) -> Optional[str]:
    """Rôle d'une cellule d'en-tête : quantite, unite, prix, designation, titre_lot."""
    if not isinstance(valeur, str):
        return None
    t = _norm(valeur)
    if not t:
        return None
    if _QUANTITE.search(t):
        return "quantite"
    if _UNITE.match(t):
        return "unite"
    if _PRIX.search(t):
        return "prix"
    if _DESIGNATION.search(t):
        return "designation"
    if _TITRE_LOT.match(t):
        return "titre_lot"   # « LOT 05 : REVÊTEMENT DE FAÇADE » au-dessus des désignations
    return None


def _entete(debut: List[Sequence]):
    """(indice de la ligne d'en-tête, colonne désignation, colonnes unité, colonne
    quantité ou None), ou None si aucun en-tête de DPGF n'est reconnu."""
    for i, ligne in enumerate(debut[:_ZONE_ENTETE]):
        roles = {j: _nature(v) for j, v in enumerate(list(ligne)[:_MAX_COLONNES])}
        par_role = {r: [j for j, x in roles.items() if x == r]
                    for r in ("quantite", "unite", "prix", "designation", "titre_lot")}
        if not (par_role["unite"] or par_role["quantite"]):
            continue
        if not (par_role["designation"] or par_role["titre_lot"] or par_role["prix"]):
            continue
        if par_role["designation"]:
            designation = par_role["designation"][0]
        elif par_role["titre_lot"]:
            designation = par_role["titre_lot"][0]
        else:
            designation = _colonne_de_texte(
                debut[i + 1:], avant=min(par_role["unite"] + par_role["quantite"]),
                exclues=set(par_role["prix"]))
            if designation is None:
                continue
        quantite = _colonne_quantite(debut, i, par_role["quantite"])
        return i, designation, par_role["unite"], quantite
    return None


def _colonne_de_texte(lignes: List[Sequence], avant: int, exclues: set) -> Optional[int]:
    """Sans en-tête « Désignation » : la colonne la plus fournie en texte, à gauche
    des unités et quantités."""
    comptes = [0] * avant
    for ligne in lignes:
        for j, v in enumerate(list(ligne)[:avant]):
            if j not in exclues and isinstance(v, str) and len(re.findall(r"[^\W\d_]", v)) >= 3:
                comptes[j] += 1
    if not comptes or max(comptes) == 0:
        return None
    return comptes.index(max(comptes))


def _colonne_quantite(debut: List[Sequence], i: int, quantites: List[int]) -> Optional[int]:
    """Une seule colonne de quantité : elle. Plusieurs (bâtiments, tranches) : celle
    du total, si une colonne la porte ; sinon aucune (jamais une quantité partielle)."""
    if len(quantites) <= 1:
        return quantites[0] if quantites else None
    entete = list(debut[i])
    for j in quantites:
        if "total" in _norm(entete[j]):
            return j
    if i > 0:
        groupes = list(debut[i - 1])[:_MAX_COLONNES]
        for g, valeur in enumerate(groupes):
            if isinstance(valeur, str) and "total" in _norm(valeur):
                suivantes = [q for q in quantites if q >= g]
                if suivantes:
                    return min(suivantes)
    return None


def _titres_de_lot(debut: List[Sequence], jusqua: int) -> Tuple[set, str]:
    """(numéros, texte) des titres de lot au-dessus du tableau : une cellule qui
    commence par « LOT N° 09 : … » (une phrase qui cite un autre lot ne compte pas)."""
    numeros, textes = set(), []
    for ligne in debut[:jusqua + 1]:
        for valeur in list(ligne)[:_MAX_COLONNES]:
            m = _TITRE_LOT.match(_norm(valeur)) if isinstance(valeur, str) else None
            if m:
                numeros.add(cle_lot(m.group(1)))
                textes.append(valeur)
    return numeros, " ".join(textes)


_MOTS_VIDES = {"lot", "lots", "les", "des", "aux", "pour", "sur", "par", "avec", "sans"}
_RESSEMBLANCE_MIN = 0.5


def _mots(texte: str) -> set:
    return {m for m in _norm(texte).split()
            if len(m) >= 3 and m not in _MOTS_VIDES and not m[0].isdigit()}


def _proches(a: str, b: str) -> bool:
    """Même mot au pluriel près, ou abréviation (« PLAF » pour « plafonds »)."""
    a, b = a.rstrip("sx"), b.rstrip("sx")
    court, long_ = sorted((a, b), key=len)
    return court == long_ or (len(court) >= 4 and long_.startswith(court))


def _ressemblance(libelle_lot: str, texte_onglet: str) -> float:
    """Part des mots de l'intitulé du lot (« Revêtement de façade – ITE ») présents
    dans le nom et le titre de l'onglet."""
    attendus, presents = _mots(libelle_lot), _mots(texte_onglet)
    if not attendus:
        return 0.0
    return sum(1 for m in attendus if any(_proches(m, n) for n in presents)) / len(attendus)


# ─── Lignes d'ouvrages ──────────────────────────────────────────────────────────

def _quantite(valeur) -> str:
    if isinstance(valeur, bool):
        return ""
    if isinstance(valeur, str):
        try:
            valeur = float(valeur.replace(" ", "").replace(" ", "").replace(",", "."))
        except ValueError:
            return ""
    if not isinstance(valeur, (int, float)) or valeur <= 0:
        return ""
    if float(valeur).is_integer():
        return str(int(valeur))
    return f"{valeur:.3f}".rstrip("0").rstrip(".").replace(".", ",")


def _unite(valeur) -> str:
    if not isinstance(valeur, str):
        return ""
    unite = valeur.strip()
    if not unite or len(unite) > 10 or not re.search(r"[^\W\d_]", unite):
        return ""
    return unite


def _ligne_ouvrage(ligne: Sequence, designation: int, unites: List[int],
                   quantite: Optional[int]) -> Optional[str]:
    ligne = list(ligne)
    if designation >= len(ligne) or not isinstance(ligne[designation], str):
        return None
    texte = " ".join(ligne[designation].split())
    if len(re.findall(r"[^\W\d_]", texte)) < 2 or _LIGNE_DE_TOTAL.match(_norm(texte)):
        return None
    texte = _MONTANT.sub(_MONTANT_RETIRE, texte)
    if len(texte) > _MAX_DESIGNATION:
        texte = texte[:_MAX_DESIGNATION - 1].rstrip() + "…"
    unite = next((u for u in (_unite(ligne[j]) for j in unites if j < len(ligne)) if u), "")
    qte = _quantite(ligne[quantite]) if quantite is not None and quantite < len(ligne) else ""
    champs = [texte, unite, qte]
    while not champs[-1]:
        champs.pop()
    return "\t".join(champs)


def _ouvrages_onglet(lignes: Iterable[Sequence]) -> Optional[Iterator[str]]:
    """Lignes d'ouvrages d'un onglet, ou None si l'onglet n'est pas une DPGF."""
    lignes = iter(lignes)
    debut = list(islice(lignes, _ZONE_LUE))
    entete = _entete(debut)
    if entete is None:
        return None
    i, designation, unites, quantite = entete
    return (texte for texte in (_ligne_ouvrage(ligne, designation, unites, quantite)
                                for ligne in chain(debut[i + 1:], lignes)) if texte)


def _numero_dans_nom(nom_onglet: str) -> Optional[str]:
    m = _TITRE_LOT.search(_norm(nom_onglet))
    return cle_lot(m.group(1)) if m else None


def _onglets_du_lot(chemin: Path, cible: str, libelle_lot: Optional[str]) -> set:
    """Classeur de plusieurs lots : rang des onglets du lot.

    L'intitulé du lot (lu dans le RC) départage : sur un vrai DCE, l'acheteur avait
    titré « LOT 05 » deux onglets, dont celui du lot 04. Le numéro de l'onglet
    (titre « LOT 05 : … » ou nom « Lot 5 ») ne sert qu'à départager deux onglets
    aussi ressemblants, ou quand l'intitulé n'apprend rien."""
    fiches = []
    for rang, (nom, lignes) in enumerate(_onglets(chemin)):
        debut = list(islice(lignes, _ZONE_LUE))
        entete = _entete(debut)
        if entete is None:
            continue
        numeros, texte_titres = _titres_de_lot(debut, entete[0])
        numero = numeros == {cible} or (not numeros and _numero_dans_nom(nom) == cible)
        score = _ressemblance(libelle_lot or "", f"{nom} {texte_titres}")
        fiches.append((rang, score, numero))
    meilleur = max((score for _, score, _ in fiches), default=0.0)
    if meilleur >= _RESSEMBLANCE_MIN:
        retenues = [f for f in fiches if f[1] == meilleur]
        numerotees = [f for f in retenues if f[2]]
        return {rang for rang, _, _ in (numerotees or retenues)}
    return {rang for rang, _, numero in fiches if numero}


# ─── Liste du lot ───────────────────────────────────────────────────────────────

def _candidats(documents, lot_id: Optional[str]) -> list:
    """Tableurs de l'acheteur pour ce lot : DPGF, ou tableur sans type reconnu (une
    DPGF mal nommée). Jamais une pièce remplie par l'entreprise."""
    retenus = []
    for doc in get_documents_for_lot(documents, lot_id):
        if getattr(doc, "is_user_completed", False):
            continue   # DPGF chiffrée par l'entreprise : jamais à l'IA
        if (doc.type or "autre") not in (TYPE_DPGF, "autre"):
            continue
        if est_tableur(doc.file_name) and (doc.file_url or "").startswith("/uploads/"):
            retenus.append(doc)
    return sorted(retenus, key=lambda d: d.file_name)


def _specifique(doc, cible: Optional[str]) -> bool:
    """La pièce ne concerne que ce lot (étiquette de lot, pas « all »)."""
    etiquettes = [t for t in (doc.related_lots or []) if t not in ("all", "info")]
    return cible is not None and any(cle_lot(t) == cible for t in etiquettes)


def texte_ouvrages_du_lot(documents, lot_id: Optional[str], racine_uploads: Path,
                          libelle_lot: Optional[str] = None) -> str:
    """Liste des ouvrages du lot, prête à partir à l'IA, ou "" s'il n'y en a pas.

    `documents` : pièces du projet (ProjectDocument). `lot_id` : « lot5 », ou
    None / « all » (marché sans lot : toutes les DPGF). `libelle_lot` : intitulé
    du lot (« Lot 05 — Revêtement de façade – ITE »), pour trouver son onglet dans
    un classeur de plusieurs lots. Bloquant : hors de la boucle d'événements."""
    cible = cle_lot(lot_id)
    blocs: List[Tuple[str, str, List[str]]] = []
    gardees, en_plus = 0, 0
    for doc in _candidats(documents, lot_id):
        chemin = racine_uploads / doc.file_url.removeprefix("/uploads/")
        if not chemin.is_file():
            continue
        try:
            # Pièce propre au lot (ou marché sans lot) : tous ses onglets de DPGF.
            # Classeur de plusieurs lots : seulement les onglets de ce lot.
            choisis = (None if cible is None or _specifique(doc, cible)
                       else _onglets_du_lot(chemin, cible, libelle_lot))
            if choisis is not None and not choisis:
                continue
            for rang, (nom_onglet, lignes) in enumerate(_onglets(chemin)):
                if choisis is not None and rang not in choisis:
                    continue
                ouvrages = _ouvrages_onglet(lignes)
                if ouvrages is None:
                    continue
                retenues = []
                for texte in ouvrages:
                    if gardees < MAX_LIGNES:
                        retenues.append(texte)
                        gardees += 1
                    else:
                        en_plus += 1
                if retenues:
                    blocs.append((doc.file_name, nom_onglet, retenues))
        except Exception as e:
            logger.warning("Ouvrages DPGF illisibles pour %s : %s", doc.file_name, e)
    if not blocs:
        return ""
    sortie = [
        f"=== {TITRE} ===",
        "Liste lue sans IA dans la DPGF : désignation, unité, et quantité quand "
        "l'acheteur la donne. Aucun prix ni montant.",
        "Désignation\tUnité\tQuantité",
    ]
    for nom_fichier, nom_onglet, lignes in blocs:
        sortie.append(f"[{nom_fichier} — onglet « {nom_onglet} »]")
        sortie.extend(lignes)
    if en_plus:
        sortie.append(f"(… {en_plus} lignes de plus, non reprises : "
                      f"liste plafonnée à {MAX_LIGNES} lignes.)")
    return "\n".join(sortie)
