"""Lecture du texte d'un fichier déposé dans une case, SANS IA : le texte et le lieu d'où il vient.

- PDF  : pdfium dans le processus isolé (`extraction_processus.pages_pdf`), page par page : chaque proposition
  garde le numéro de sa page. Au plus `PLAFOND_PAGES_LUES` pages ; au-delà, le plafond est ATTEINT et affiché
  (« Lu jusqu'à la page 40 »), jamais de troncature silencieuse.
- Word : `texte_docx` (garde anti-bombe de décompression). Les anciens .doc et .xls sont refusés au dépôt.
- Excel : une feuille = un lieu ; lecture bornée (lignes, colonnes, cellules) par la garde existante. Pour les cases
  « personnes », les colonnes de noms, d'adresses, de dates de naissance, de téléphones et de numéros personnels sont
  retirées DÈS LA LECTURE : leur contenu ne quitte même pas ce module.
- Image, PDF sans texte (scan) : OCR local (`ocr_local`), indisponible tant qu'aucun moteur n'est installé : le
  fichier reste au coffre-fort, « lisible seulement avec un OCR ».
Ne lève jamais : un échec devient `Lecture.echec` (message sans contenu du fichier).
"""
from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from services import ocr_local
from services.depot_cases import PLAFOND_PAGES_LUES

logger = logging.getLogger(__name__)

# Un PDF dont les pages ne portent presque pas de texte est un scan.
SEUIL_CARACTERES_PAR_PAGE = 25
MAX_FEUILLES = 20
MAX_LIGNES_PAR_FEUILLE = 5000
MAX_CARACTERES_DOCX = 400_000

MESSAGE_OCR = "Image ou scan : lisible seulement avec un OCR."
MESSAGE_ECHEC = "Ce fichier n'a pas pu être lu."
MESSAGE_ECARTEE = "Ce fichier a été retiré du coffre-fort : sa lecture est annulée."

_ENTETES_PERSONNELS = re.compile(
    r"\b(?:nom|noms|prenom|prenoms|matricule|nir|secu|securite|adresse|naissance|ne|nee|telephone|tel|mobile|portable|"
    r"mail|email|courriel|photo|iban|rib|ville|postal|cp|salaire|remuneration)\b")


@dataclass
class Unite:
    """Un morceau de texte et le lieu d'où il vient : page d'un PDF, feuille d'un tableur, document Word."""
    lieu: str
    page: Optional[int]
    texte: str


@dataclass
class Lecture:
    unites: list = field(default_factory=list)
    pages_total: Optional[int] = None
    pages_lues: Optional[int] = None
    plafond_atteint: bool = False
    ocr_requis: bool = False
    echec: bool = False
    message: Optional[str] = None
    colonnes_retirees: int = 0

    @property
    def lisible(self) -> bool:
        return any(u.texte.strip() for u in self.unites)


def _sans_accents(texte: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", str(texte).lower()) if not unicodedata.combining(c))


def _entete_personnel(valeur) -> bool:
    return bool(valeur) and bool(_ENTETES_PERSONNELS.search(re.sub(r"[^a-z0-9]+", " ", _sans_accents(valeur))))


def lire_fichier(chemin: Path, extension: str, personnes: bool = False,
                 plafond_pages: int = PLAFOND_PAGES_LUES) -> Lecture:
    try:
        if extension == ".pdf":
            return _lire_pdf(chemin, plafond_pages)
        if extension == ".docx":
            return _lire_docx(chemin)
        if extension == ".xlsx":
            return _lire_tableur(chemin, personnes)
        if extension in (".png", ".jpg", ".jpeg"):
            return _lire_image(chemin)
    except Exception as exc:   # jamais le contenu dans le journal : seulement le type de l'erreur
        logger.warning("depot : lecture impossible (%s)", type(exc).__name__)
        return Lecture(echec=True, message=MESSAGE_ECHEC)
    return Lecture(message=MESSAGE_ECHEC, echec=True)


def _lire_image(chemin: Path) -> Lecture:
    if not ocr_local.disponible():
        return Lecture(ocr_requis=True, message=MESSAGE_OCR)
    texte = ocr_local.lire(Path(chemin).read_bytes())
    return Lecture(unites=[Unite("image", None, texte)]) if texte.strip() else Lecture(ocr_requis=True, message=MESSAGE_OCR)


def _lire_pdf(chemin: Path, plafond_pages: int) -> Lecture:
    from services import extraction_processus, pdfium_processus
    try:
        pages = extraction_processus.pages_pdf(str(chemin), max_pages=plafond_pages + 1)
    except pdfium_processus.TravailPdfiumEchoue as echec:
        logger.warning("depot : lecture PDF interrompue (%s)", echec.raison)
        return Lecture(echec=True, message="La lecture de ce PDF a été interrompue (fichier lourd, abîmé, ou serveur "
                                           "occupé). Redéposez-le dans quelques minutes.")
    plafond_atteint = len(pages) > plafond_pages
    lues = list(pages[:plafond_pages])
    if not lues:
        return Lecture(echec=True, message=MESSAGE_ECHEC)
    unites = [Unite(f"page {i}", i, t) for i, t in enumerate(lues, 1)]
    lecture = Lecture(
        unites=unites, pages_lues=len(lues), pages_total=None if plafond_atteint else len(lues),
        plafond_atteint=plafond_atteint,
        message=f"Lu jusqu'à la page {plafond_pages}." if plafond_atteint else None)
    caracteres = sum(len(t.strip()) for t in lues)
    if caracteres < SEUIL_CARACTERES_PAR_PAGE * len(lues):
        if ocr_local.disponible():
            return lecture   # le futur moteur complétera les pages sans texte
        return Lecture(ocr_requis=True, message=MESSAGE_OCR, pages_lues=len(lues), pages_total=lecture.pages_total)
    return lecture


def _lire_docx(chemin: Path) -> Lecture:
    from services.document_processor import texte_docx
    texte = texte_docx(str(chemin))
    if not texte.strip():
        return Lecture(message="Ce document Word ne contient pas de texte.")
    return Lecture(unites=[Unite("document Word", None, texte[:MAX_CARACTERES_DOCX])],
                   plafond_atteint=len(texte) > MAX_CARACTERES_DOCX)


def _lire_tableur(chemin: Path, personnes: bool) -> Lecture:
    from services import tableur_ancre as ta
    bilan = ta._Bilan()
    unites: list[Unite] = []
    retirees = 0
    for k, (nom, lignes) in enumerate(ta._feuilles(chemin, False, None, bilan)):
        if k >= MAX_FEUILLES:
            break
        masquees: set[int] = set()
        morceaux: list[str] = []
        entete_vu = False
        for numero, valeurs in lignes:
            if numero > MAX_LIGNES_PAR_FEUILLE:
                break
            if personnes and not entete_vu and sum(1 for v in valeurs if isinstance(v, str) and v.strip()) >= 2:
                entete_vu = True
                masquees = {i for i, v in enumerate(valeurs) if isinstance(v, str) and _entete_personnel(v)}
                retirees += len(masquees)
            cellules = [ta._afficher(v) for i, v in enumerate(valeurs) if i not in masquees and v is not None]
            ligne = "\t".join(c for c in cellules if c.strip())
            if ligne.strip():
                morceaux.append(ligne)
        if morceaux:
            unites.append(Unite(f"feuille « {nom} »", None, "\n".join(morceaux)))
    if not unites:
        return Lecture(message="Ce tableur ne contient pas de texte.")
    return Lecture(unites=unites, plafond_atteint=bilan.tronque, colonnes_retirees=retirees,
                   message="Tableur lu en partie (très volumineux)." if bilan.tronque else None)
