"""Fiches « Mon entreprise » : fabrication du fichier (PDF, Word, Excel) et aperçu en images, page par page.

``fabriquer`` produit le fichier à télécharger. ``demander_apercu`` produit LE MÊME fichier, le convertit en PDF
(LibreOffice isolé, ``services.libreoffice_isole``), rend ses pages en WebP (pdfium dans son processus isolé,
``services.pdf_rendu``) et les range dans un cache disque adressé par contenu : ce que l'on voit est exactement ce que
l'on télécharge (le Word et le PDF viennent du même document ; le classeur Excel est converti tel quel).

Empreinte : ``sha256(org_id, rubrique, format, données assemblées, bordereau, empreinte du logo, version du moteur)``.
Même contenu, même empreinte : l'aperçu est servi du cache sans rien regénérer ; une donnée, un champ du bordereau, le
logo ou le moteur qui change donne une autre empreinte.

Une génération à la fois par ENTREPRISE, en tâche de fond (un fil, pas de Celery : la conversion LibreOffice est déjà
sérialisée sur la machine, l'aperçu est interactif et jetable). Une demande qui arrive pendant qu'une autre tourne
REMPLACE la demande en attente : la dernière gagne, il n'y a pas de file qui grossit.

Données et logo sont lus par la route AVANT de lancer le fil (``_preparer`` du routeur) : le fil ne touche pas à la
base. Rien de l'entreprise ne se lit dans le disque du cache : clés en hachage, identifiant d'entreprise haché.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
from collections import OrderedDict
from pathlib import Path
from typing import Optional

from services import fiches_entreprise as generation
from services import fiches_excel
from services.cache_apercus import CacheApercus
from services.libreoffice_isole import PdfConversionError, convertir_en_pdf, soffice_available
from services.pdf_rendu import rendre_document_webp

logger = logging.getLogger(__name__)

VERSION_MOTEUR = 1              # à incrémenter quand la mise en page (Word, Excel) ou le rendu des pages change
LARGEUR_PX = 1000               # net sur un écran 2× pour une colonne d'aperçu de ~500 px, pas plus lourd
PAGES_MAX = 20                  # une fiche fait 1 à 5 pages ; au-delà, les 20 premières sont montrées
FORMATS = ("pdf", "docx", "xlsx")
PLAFOND_MO_DEFAUT = 256
_RACINE_BACKEND = Path(__file__).resolve().parents[1]
ETATS_MAX_PAR_ENTREPRISE = 8     # états retenus par entreprise (LRU) : une entreprise ne peut pas évincer celles des autres
ETATS_TERMINES_MAX = 512         # plafond global de sécurité, sur les seules entrées terminées (prêt, erreur)
MESSAGE_INDISPONIBLE = "Aperçu simplifié : le rendu exact est indisponible pour le moment."


def fabriquer(format_: str, donnees: dict, bordereau: dict, pal: dict, logo_png: Optional[bytes]) -> tuple[bytes, str]:
    """(octets, type MIME) de la fiche dans le format demandé ; ``PdfConversionError`` si le PDF est indisponible."""
    if format_ == "xlsx":
        return fiches_excel.generer_xlsx(donnees, bordereau, pal), fiches_excel.TYPE_XLSX
    docx = generation.generer_docx(donnees, bordereau, pal, logo_png)
    if format_ == "docx":
        return docx, generation.TYPE_DOCX
    return generation.generer_pdf(docx), generation.TYPE_PDF


def _pdf_de_l_apercu(format_: str, donnees: dict, bordereau: dict, pal: dict, logo_png: Optional[bytes]) -> bytes:
    """Le PDF dont on montre les pages : celui du téléchargement (PDF) ; le Word et le classeur, convertis tels quels."""
    contenu, _type = fabriquer(format_, donnees, bordereau, pal, logo_png)
    if format_ == "pdf":
        return contenu
    return convertir_en_pdf(contenu, ".docx" if format_ == "docx" else ".xlsx")


# ─── Empreinte et cache ────────────────────────────────────────────────────────

def empreinte(org_id: str, rubrique: str, format_: str, donnees: dict, bordereau: dict,
              logo_png: Optional[bytes]) -> str:
    brut = json.dumps(
        {"org": org_id, "rubrique": rubrique, "format": format_, "donnees": donnees, "bordereau": bordereau,
         "logo": hashlib.sha256(logo_png).hexdigest() if logo_png else None, "moteur": VERSION_MOTEUR},
        sort_keys=True, ensure_ascii=False, default=str,
    )
    return hashlib.sha256(brut.encode("utf-8")).hexdigest()


def _hache(*morceaux) -> str:
    return hashlib.sha256("|".join(str(m) for m in morceaux).encode("utf-8")).hexdigest()


def _cle_page(emp: str, n: int) -> str:
    return _hache("fiche", VERSION_MOTEUR, emp, "page", n)


def _cle_meta(emp: str) -> str:
    return _hache("fiche", VERSION_MOTEUR, emp, "meta")


_cache: Optional[CacheApercus] = None
_verrou_cache = threading.Lock()


def cache_fiches() -> CacheApercus:
    """Cache disque des pages d'aperçu : dossier et plafond à part de celui de « Voir dans le DCE »."""
    global _cache
    with _verrou_cache:
        if _cache is None:
            try:
                mo = int(os.environ.get("SYNORIX_CACHE_FICHES_MO", "").strip() or PLAFOND_MO_DEFAUT)
            except ValueError:
                mo = PLAFOND_MO_DEFAUT
            dossier = os.environ.get("SYNORIX_CACHE_FICHES_DIR") or _RACINE_BACKEND / "cache" / "fiches"
            _cache = CacheApercus(dossier, max(1, mo) * 1024 * 1024)
        return _cache


def _ecrire_resultat(emp: str, org_id: str, rubrique: str, format_: str, total: int, pages: list[bytes]) -> None:
    cache = cache_fiches()
    for i, octets in enumerate(pages, start=1):
        cache.ecrire(_cle_page(emp, i), octets)
    meta = {"org": _hache("org", org_id), "rubrique": rubrique, "format": format_, "pages": len(pages), "total": total}
    cache.ecrire(_cle_meta(emp), json.dumps(meta).encode("utf-8"))      # écrite en dernier : « prêt » = tout est là


def _lire_meta(emp: str) -> Optional[dict]:
    octets = cache_fiches().lire(_cle_meta(emp))
    try:
        meta = json.loads(octets) if octets else None
    except ValueError:
        return None
    return meta if isinstance(meta, dict) else None


def _pret(emp: str, org_id: str, rubrique: str) -> Optional[dict]:
    """La fiche prête de CETTE entreprise (méta lisible et toutes les pages présentes), sinon None. Une empreinte
    produite pour une autre entreprise est « inconnue »."""
    meta = _lire_meta(emp)
    if not meta or meta.get("org") != _hache("org", org_id) or meta.get("rubrique") != rubrique:
        return None
    cache = cache_fiches()
    if not all(cache.existe(_cle_page(emp, i)) for i in range(1, int(meta.get("pages", 0)) + 1)):
        return None                          # évincées en partie : à regénérer
    return meta


# ─── Une génération à la fois par entreprise (la dernière demande gagne) ───────

class _Travail:
    def __init__(self, emp, org_id, rubrique, format_, donnees, bordereau, pal, logo_png) -> None:
        self.emp, self.org_id, self.rubrique, self.format_ = emp, org_id, rubrique, format_
        self.donnees, self.bordereau, self.pal, self.logo_png = donnees, bordereau, pal, logo_png


class _Entreprise:
    def __init__(self) -> None:
        self.en_cours: Optional[str] = None       # empreinte en cours de fabrication
        self.attente: Optional[_Travail] = None   # au plus UNE demande en attente


_verrou = threading.Lock()
_entreprises: dict[str, _Entreprise] = {}
# org_id -> {empreinte -> {rubrique, etat, message, ordre}}, du plus ancien au plus récent. Une table PAR entreprise : l'éviction
# ne touche que celle de l'entreprise qui demande, et jamais une entrée « en cours » (une entreprise en a au plus deux : celle
# qui tourne et celle qui attend) ; le plafond global ne porte que sur les entrées terminées.
_etats: "dict[str, OrderedDict[str, dict]]" = {}
_ordre = 0
LANCEMENTS: list[str] = []                             # empreintes réellement lancées (observé par les tests)


def _noter(emp: str, org_id: str, rubrique: str, etat: str, message: str = "") -> None:
    """Note l'état d'une empreinte pour son entreprise (appelé sous ``_verrou``) puis borne les tables."""
    global _ordre
    _ordre += 1
    table = _etats.setdefault(org_id, OrderedDict())
    table[emp] = {"rubrique": rubrique, "etat": etat, "message": message, "ordre": _ordre}
    table.move_to_end(emp)
    for ancien in [e for e, v in table.items() if v["etat"] != "en_cours"]:         # les plus anciennes terminées d'abord
        if len(table) <= ETATS_MAX_PAR_ENTREPRISE:
            break
        del table[ancien]
    termines = [(v["ordre"], o, e) for o, t in _etats.items() for e, v in t.items() if v["etat"] != "en_cours"]
    if len(termines) > ETATS_TERMINES_MAX:
        for _, o, e in sorted(termines)[: len(termines) - ETATS_TERMINES_MAX]:
            del _etats[o][e]
    for o in [o for o, t in _etats.items() if not t]:
        del _etats[o]


def _etat_de(org_id: str, emp: str) -> Optional[dict]:
    return _etats.get(org_id, {}).get(emp)


def demander_apercu(org_id: str, rubrique: str, format_: str, donnees: dict, bordereau: dict, pal: dict,
                    logo_png: Optional[bytes]) -> dict:
    """``{etat: "pret", empreinte, pages}`` si les pages sont en cache ; ``{etat: "en_cours", empreinte}`` après avoir
    lancé (ou remplacé la demande en attente) ; ``{etat: "indisponible", message}`` sans LibreOffice."""
    emp = empreinte(org_id, rubrique, format_, donnees, bordereau, logo_png)
    meta = _pret(emp, org_id, rubrique)
    if meta is not None:
        return {"etat": "pret", "empreinte": emp, "pages": int(meta["pages"])}
    if not soffice_available():
        return {"etat": "indisponible", "empreinte": emp, "message": MESSAGE_INDISPONIBLE}
    travail = _Travail(emp, org_id, rubrique, format_, donnees, bordereau, pal, logo_png)
    with _verrou:
        connu = _etat_de(org_id, emp)
        if connu and connu["etat"] == "en_cours":
            return {"etat": "en_cours", "empreinte": emp}               # la même demande tourne ou attend déjà
        entreprise = _entreprises.setdefault(org_id, _Entreprise())
        _noter(emp, org_id, rubrique, "en_cours")
        if entreprise.en_cours is not None:
            if entreprise.attente is not None:                          # la dernière gagne
                _noter(entreprise.attente.emp, org_id, entreprise.attente.rubrique, "erreur",
                       "Remplacée par une demande plus récente.")
            entreprise.attente = travail
            return {"etat": "en_cours", "empreinte": emp}
        entreprise.en_cours = emp
    threading.Thread(target=_boucle, args=(travail,), name=f"synorix-fiche-apercu-{emp[:8]}", daemon=True).start()
    return {"etat": "en_cours", "empreinte": emp}


def _boucle(travail: _Travail) -> None:
    """Fabrique la demande, puis celle qui a pris sa place en attente, jusqu'à ce qu'il n'y en ait plus."""
    while travail is not None:
        _fabriquer_apercu(travail)
        with _verrou:
            entreprise = _entreprises.get(travail.org_id)
            suivante = None
            if entreprise is not None:
                suivante, entreprise.attente = entreprise.attente, None
                entreprise.en_cours = suivante.emp if suivante else None
                if suivante is None:
                    _entreprises.pop(travail.org_id, None)
        travail = suivante


def _fabriquer_apercu(t: _Travail) -> None:
    LANCEMENTS.append(t.emp)
    del LANCEMENTS[:-200]
    try:
        pdf = _pdf_de_l_apercu(t.format_, t.donnees, t.bordereau, t.pal, t.logo_png)
        total, pages = rendre_document_webp(pdf, LARGEUR_PX, PAGES_MAX)
        _ecrire_resultat(t.emp, t.org_id, t.rubrique, t.format_, total, pages)
        etat, message = "pret", ""
    except PdfConversionError as exc:
        etat, message = "erreur", str(exc)
    except Exception as exc:  # noqa: BLE001 — un aperçu qui échoue ne casse jamais le fil ni la suite des demandes
        logger.warning("Aperçu de fiche : échec (%s)", type(exc).__name__)
        etat, message = "erreur", "L'aperçu n'a pas pu être produit pour le moment."
    with _verrou:
        _noter(t.emp, t.org_id, t.rubrique, etat, message)


# ─── Lecture de l'état et des pages ────────────────────────────────────────────

def etat_apercu(org_id: str, rubrique: str, emp: str) -> Optional[dict]:
    """``{etat, pages, message}`` de l'empreinte pour CETTE entreprise ; None si elle n'en a jamais demandé une
    telle (la route répond alors 404, comme pour une empreinte d'une autre entreprise)."""
    meta = _pret(emp, org_id, rubrique)
    if meta is not None:
        return {"etat": "pret", "pages": int(meta["pages"]), "message": ""}
    with _verrou:
        connu = _etat_de(org_id, emp)
    if connu is None or connu["rubrique"] != rubrique:
        return None
    if connu["etat"] == "pret":                      # noté prêt mais évincé du cache depuis : à redemander
        return {"etat": "erreur", "pages": 0, "message": "L'aperçu a expiré : il va être régénéré."}
    return {"etat": connu["etat"], "pages": 0, "message": connu["message"]}


def page_apercu(org_id: str, rubrique: str, emp: str, numero: int) -> Optional[bytes]:
    """Image WebP de la page ``numero`` (1 = première) de la fiche prête de cette entreprise, sinon None."""
    meta = _pret(emp, org_id, rubrique)
    if meta is None or not 1 <= numero <= int(meta["pages"]):
        return None
    return cache_fiches().lire(_cle_page(emp, numero))


def oublier_tout() -> None:
    """Remet à zéro l'état en mémoire (tests)."""
    with _verrou:
        _entreprises.clear()
        _etats.clear()
        LANCEMENTS.clear()
