"""B9 — contrôle des fichiers du ZIP avant le dépôt sur la plateforme de l'acheteur (0 €, aucune IA).

Fonction pure sur l'archive réellement produite (``controler_fichiers_zip``) : une ligne « À relire » par point,
jamais bloquante. Trois contrôles :

  1. « [À COMPLÉTER » restants dans un fichier qui part (mémoire PDF ou Word, formulaire rempli…), comptés avec la
     MÊME règle que l'export Word (``docx_exporter._A_COMPLETER_RE``), avec les pages pour un PDF.
  2. Noms de fichiers ou de dossiers à caractères qui cassent, et chemins trop longs. Règle SOURCÉE : prérequis
     techniques de la plateforme e-marchespublics.com (version du 25/09/2014, point 9) : « Le nom des fichiers /
     Dossiers à transmettre ne doit en aucun cas contenir de caractère spécifique tel que : apostrophe, accent,
     ponctuation, espace, caractères spéciaux… En outre, le chemin d'accès avec le nom de fichier inclus ne peut
     dépasser 150 caractères. » Le point, le tiret et le tiret bas restent permis (ils séparent l'extension et les
     mots dans les noms que Synorix écrit). Une plateforme parmi d'autres : la ligne dit « certaines plateformes ».
  3. Taille, SEULEMENT si l'analyse a relevé une limite dans le règlement (``limite_de_taille`` sur les exigences,
     même principe que ``relecture_memoire.limite_de_pages``) : chaque fichier comparé à une limite « par
     fichier », l'archive entière à une limite du pli. Sans limite relevée : aucune ligne, rien n'est inventé.
     Mo = 1 000 000 octets (mégaoctet du Système international) : la lecture la plus prudente.

Mots positifs seulement : jamais « manquant », « incomplet » ni « absent ».
"""
from __future__ import annotations

import io
import logging
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any, Callable, Iterable, Optional, Union

from services.docx_exporter import _A_COMPLETER_RE

logger = logging.getLogger(__name__)

A_RELIRE = "À relire"

SOURCE_NOMS = {
    "type": "regle",
    "texte": "Prérequis techniques de la plateforme e-marchespublics.com (version du 25/09/2014), point 9",
    "url": "https://e-marchespublics.com/prerequis",
}
CHEMIN_MAX = 150                      # caractères, chemin et nom compris (même source)
_PERMIS = re.compile(r"[A-Za-z0-9._\-]")
_LECTURE_MAX = 60_000_000             # octets décompressés lus pour chercher le texte d'un fichier
_PAGES_MAX = 300

# ── Limite de taille lue dans le règlement ────────────────────────────────────

_UNITES = {"ko": 1_000, "kb": 1_000, "mo": 1_000_000, "mb": 1_000_000, "go": 1_000_000_000, "gb": 1_000_000_000}
_TAILLE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(ko|kb|mo|mb|go|gb|megaoctets?|mega-octets?|gigaoctets?|giga-octets?)\b")
_LIMITANT = re.compile(
    r"ne\s+(?:doit|doivent|devra|devront|pourra|peut|peuvent)\s+pas\s+(?:depasser|exceder)|n['’]excede(?:ra)?\s+pas"
    r"|ne\s+depasse(?:ra)?\s+pas|maximum|maximale?s?|max\.?|limite[es]?|au\s+plus|pas\s+plus\s+de|plafonne")
_OBJET = re.compile(r"fichiers?|pli|plis|depot|document|piece|archive|zip")
_PAR_FICHIER = re.compile(r"(?:par|chaque|un|chacun\s+des)\s+fichiers?|fichiers?\s+unitaires?|taille\s+unitaire")


def _sans_accents(texte: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", texte or "") if not unicodedata.combining(c))


def _octets_unite(unite: str) -> int:
    if unite.startswith("mega"):
        return 1_000_000
    if unite.startswith("giga"):
        return 1_000_000_000
    return _UNITES[unite]


def _libelle_taille(octets: float) -> str:
    """« 1,2 Mo », « 10 Mo », « 850 ko », « 1 Go » (virgule décimale)."""
    for seuil, unite in ((1_000_000_000, "Go"), (1_000_000, "Mo"), (1_000, "ko")):
        if octets >= seuil:
            valeur = round(octets / seuil, 1)
            texte = f"{valeur:.1f}".rstrip("0").rstrip(".")
            return f"{texte.replace('.', ',')} {unite}"
    return f"{int(octets)} octets"


def limite_de_taille(exigences: Iterable[dict]) -> Optional[dict]:
    """La limite de taille des fichiers déposés, SI une exigence relevée par l'analyse la porte (« la taille de
    chaque fichier ne doit pas excéder 10 Mo ») : ``{octets, libelle, portee, source}`` (portée « fichier » ou
    « ensemble »). Sinon None."""
    for e in exigences:
        texte = _sans_accents(str(e.get("texte") or "")).lower().replace("’", "'")
        m = _TAILLE.search(texte)
        if not m or not _LIMITANT.search(texte) or not _OBJET.search(texte):
            continue
        valeur = float(m.group(1).replace(",", "."))
        if valeur <= 0:
            continue
        octets = int(valeur * _octets_unite(m.group(2)))
        unite = {"k": "ko", "m": "Mo", "g": "Go"}[m.group(2)[0]]
        nombre = m.group(1).replace(".", ",")
        return {"octets": octets, "libelle": f"{nombre} {unite}",
                "portee": "fichier" if _PAR_FICHIER.search(texte) else "ensemble",
                "source": e.get("source")}
    return None


# ── Contrôles ─────────────────────────────────────────────────────────────────

def _ligne(type_: str, fichier: Optional[str], texte: str, source: Optional[dict], **extra) -> dict:
    return {"type": type_, "libelle": A_RELIRE, "fichier": fichier, "texte": texte, "source": source, **extra}


def _categories_interdites(nom: str) -> list[str]:
    vus: list[str] = []
    for c in nom:
        if _PERMIS.fullmatch(c):
            continue
        if c in "'’":
            cat = "apostrophe"
        elif c.isspace():
            cat = "espace"
        elif unicodedata.normalize("NFKD", c) != c or not c.isascii() and c.isalpha():
            cat = "accent"
        else:
            cat = f"caractère spécial ({c})"
        if cat not in vus:
            vus.append(cat)
    return vus


def _controle_nom(chemin: str) -> list[dict]:
    lignes: list[dict] = []
    categories: list[str] = []
    for partie in PurePosixPath(chemin).parts:
        for cat in _categories_interdites(partie):
            if cat not in categories:
                categories.append(cat)
    if categories:
        lignes.append(_ligne(
            "nom", chemin,
            f"Nom avec {', '.join(categories)} : certaines plateformes de dépôt refusent ces caractères. "
            "Renommez le fichier avant le dépôt.", SOURCE_NOMS))
    if len(chemin) > CHEMIN_MAX:
        lignes.append(_ligne(
            "chemin", chemin,
            f"Chemin de {len(chemin)} caractères : certaines plateformes de dépôt n’acceptent pas plus de "
            f"{CHEMIN_MAX} caractères, dossiers compris. Raccourcissez le nom avant le dépôt.", SOURCE_NOMS))
    return lignes


def _textes_par_page(nom: str, octets: bytes) -> list[str]:
    """Le texte d'un fichier, par page pour un PDF (une seule « page » sinon). Vide si illisible."""
    bas = nom.lower()
    try:
        if bas.endswith(".pdf"):
            from services.pdf_lecture import lire_document
            return lire_document(octets, max_pages=_PAGES_MAX).pages
        if bas.endswith(".docx"):
            from services.document_processor import texte_docx
            return [texte_docx(octets)]
        if bas.endswith((".xlsx", ".xlsm", ".xls", ".ods", ".txt")):
            from services.document_processor import DocumentProcessor
            texte, _pages, _avertissement = DocumentProcessor().extract_ex(octets, nom)
            return [texte]
    except Exception as exc:   # un fichier illisible n'empêche jamais le contrôle des autres
        logger.info("Contrôle B9 : texte non lu (%s)", type(exc).__name__)
    return []


def _controle_a_completer(chemin: str, octets: bytes) -> Optional[dict]:
    pages = _textes_par_page(chemin, octets)
    comptes = [len(_A_COMPLETER_RE.findall(t or "")) for t in pages]
    total = sum(comptes)
    if not total:
        return None
    numeros = [i + 1 for i, n in enumerate(comptes) if n] if chemin.lower().endswith(".pdf") else []
    texte = f"{total} passage{'s' if total > 1 else ''} « [À COMPLÉTER » "
    texte += "reste" if total == 1 else "restent"
    if numeros:
        texte += f" (page{'s' if len(numeros) > 1 else ''} {', '.join(str(n) for n in numeros)})"
    texte += " : complétez-les avant le dépôt."
    return _ligne("a_completer", chemin, texte, {"type": "fichier", "fichier": chemin},
                  nombre=total, pages=numeros)


@dataclass(frozen=True)
class FichierAControler:
    """Un fichier qui part dans le dossier : son chemin dans le ZIP, sa taille (None : inconnue avant l'export,
    le mémoire généré), et de quoi lire ses octets quand son texte doit être cherché (None : pas lu)."""
    chemin: str
    taille: Optional[int] = None
    lire: Optional[Callable[[], bytes]] = None


def controler_fichiers(fichiers: Iterable[FichierAControler], limite: Optional[dict] = None) -> list[dict]:
    """Les lignes « À relire » des fichiers d'un dossier, dans l'ordre. ``limite`` : ``limite_de_taille(...)``."""
    lignes: list[dict] = []
    total = 0
    for f in fichiers:
        total += f.taille or 0
        lignes += _controle_nom(f.chemin)
        if f.lire is not None and (f.taille is None or f.taille <= _LECTURE_MAX):
            try:
                octets = f.lire()
            except OSError as exc:
                logger.info("Contrôle B9 : fichier non lu (%s)", type(exc).__name__)
                octets = b""
            ligne = _controle_a_completer(f.chemin, octets) if octets else None
            if ligne:
                lignes.append(ligne)
        if limite and limite.get("portee") == "fichier" and f.taille is not None and f.taille > limite["octets"]:
            lignes.append(_ligne(
                "taille", f.chemin,
                f"{_libelle_taille(f.taille)} pour {limite['libelle']} au plus par fichier "
                "selon le règlement : allégez ou découpez le fichier avant le dépôt.",
                limite.get("source"), octets=f.taille))
    if limite and limite.get("portee") == "ensemble" and total > limite["octets"]:
        lignes.append(_ligne(
            "taille", None,
            f"Le dossier pèse {_libelle_taille(total)} pour {limite['libelle']} au plus selon le règlement : "
            "allégez les fichiers les plus lourds avant le dépôt.", limite.get("source"), octets=total))
    return lignes


def controler_fichiers_zip(archive: Union[bytes, str, Any], limite: Optional[dict] = None) -> list[dict]:
    """Les lignes « À relire » d'une archive ZIP (octets ou chemin), chaque fichier lu. Ne lève jamais :
    archive illisible → []."""
    source = io.BytesIO(archive) if isinstance(archive, (bytes, bytearray)) else archive
    try:
        with zipfile.ZipFile(source) as zf:
            fichiers = [FichierAControler(i.filename, i.file_size, (lambda i=i: zf.read(i)))
                        for i in zf.infolist() if not i.is_dir()]
            return controler_fichiers(fichiers, limite)
    except (zipfile.BadZipFile, OSError) as exc:
        logger.info("Contrôle B9 : archive non lue (%s)", type(exc).__name__)
        return []


def ligne_memoire(chemin: str, passages: int) -> Optional[dict]:
    """Le mémoire est généré à l'export : ses passages « [À COMPLÉTER » se comptent sur son contenu, avec la règle
    de l'export Word (``docx_exporter.compter_passages_a_completer``)."""
    if passages <= 0:
        return None
    texte = (f"{passages} passage{'s' if passages > 1 else ''} « [À COMPLÉTER » "
             f"{'reste' if passages == 1 else 'restent'} dans le mémoire : complétez-les à l’étape Rédiger "
             "avant le dépôt.")
    return _ligne("a_completer", chemin, texte, {"type": "memoire", "fichier": chemin}, nombre=passages, pages=[])
