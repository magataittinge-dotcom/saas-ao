"""Synchronisation des avis de marché du BOAMP (API Explore v2.1 d'Opendatasoft, DILA, licence ouverte).

Champs réellement lus : voir `.claude/echange/sprint-ozcan/veille/BOAMP-API.md`. Principes :
  * lecture incrémentale, jour de parution par jour de parution (l'API plafonne offset+limit à 10 000) ;
  * seulement les avis de marché (`nature = APPEL_OFFRE`) de travaux, avec une date limite à venir ;
  * un avis corrigé (nature APPEL_OFFRE, etat RECTIFICATIF) porte son propre idweb et pointe l'avis
    d'origine par `annonce_lie` : il remplace la ligne d'origine ;
  * upsert par `id_boamp`, rejouable sans doublon ; les avis dont la date limite est passée sont supprimés.
Aucune donnée n'est stockée hors des champs du contrat. Aucun secret : l'API est publique.
"""
from __future__ import annotations

import html
import logging
import time
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Callable, Iterator

import httpx

from services.veille.departements import normaliser_departement
from services.veille.metiers import deduire_metiers

logger = logging.getLogger("synorix.veille")

URL_BOAMP = "https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records"
URL_AVIS_DEFAUT = "https://www.boamp.fr/pages/avis/?q=idweb:{idweb}"
USER_AGENT = "Synorix/veille"
DELAI_S = 20.0
TENTATIVES = 3
PAGE = 100                      # maximum de l'API
FENETRE_INITIALE_JOURS = 45
CHAMPS = (
    "idweb,objet,nomacheteur,code_departement,dateparution,datelimitereponse,famille,nature,etat,"
    "type_procedure,procedure_libelle,type_marche,descripteur_code,descripteur_libelle,url_avis,"
    "annonce_lie,donnees"
)
_PROCEDURES = {
    "OUVERT": "ouvert", "PROCEDURE_ADAPTE": "adaptee", "NEGOCIE": "negociee",
    "RESTREINT": "restreint", "DIALOGUE_COMPETITIF": "dialogue",
}


class ErreurBoamp(RuntimeError):
    """L'API n'a pas répondu correctement après les reprises."""


@dataclass
class Resultat:
    simulation: bool = False
    depuis: str = ""
    jusqu_au: str = ""
    lus: int = 0
    retenus: int = 0
    crees: int = 0
    mis_a_jour: int = 0
    ignores: int = 0
    supprimes_expires: int = 0

    def en_dict(self) -> dict:
        return asdict(self)


# ── Lecture d'un enregistrement ────────────────────────────────────────────────────────────────

def normaliser_procedure(type_procedure) -> str:
    return _PROCEDURES.get(str(type_procedure or "").strip().upper(), "autre")


def _parcourir(noeud: Any, visite: Callable[[str, Any], None]) -> None:
    if isinstance(noeud, dict):
        for cle, valeur in noeud.items():
            visite(cle, valeur)
            _parcourir(valeur, visite)
    elif isinstance(noeud, list):
        for element in noeud:
            _parcourir(element, visite)


def _donnees(enreg: dict) -> Any:
    import json
    brut = enreg.get("donnees")
    if isinstance(brut, (dict, list)):
        return brut
    try:
        return json.loads(brut) if brut else {}
    except (TypeError, ValueError):
        return {}


def extraire_cpv(donnees: Any) -> list[str]:
    """Codes CPV à 8 chiffres : FNSimple (`classPrincipale`/`classSupplementaire`) et eForms
    (`cbc:ItemClassificationCode` de liste `cpv`). Les avis MAPA n'en portent pas."""
    trouves: dict[str, None] = {}

    def visite(cle: str, valeur: Any) -> None:
        if cle in ("classPrincipale", "classSupplementaire") and isinstance(valeur, (str, int)):
            code = "".join(c for c in str(valeur) if c.isdigit())[:8]
            if len(code) == 8:
                trouves[code] = None
        elif cle == "cbc:ItemClassificationCode":
            for element in valeur if isinstance(valeur, list) else [valeur]:
                if isinstance(element, dict) and element.get("@listName") == "cpv":
                    code = "".join(c for c in str(element.get("#text", "")) if c.isdigit())[:8]
                    if len(code) == 8:
                        trouves[code] = None

    _parcourir(donnees, visite)
    return list(trouves)


def extraire_url_dossier(donnees: Any) -> str | None:
    """Adresse de retrait du dossier : `urlDocConsul` (FNSimple) ou l'URI de la pièce de consultation
    (eForms). Les avis MAPA n'en ont pas : None."""
    candidates: list[str] = []

    def visite(cle: str, valeur: Any) -> None:
        if cle in ("urlDocConsul", "cbc:URI", "cbc:EndpointID") and isinstance(valeur, str):
            candidates.append(valeur.strip())

    _parcourir(donnees, visite)
    for url in candidates:
        if url.lower().startswith(("https://", "http://")):
            return url[:1000]
    return None


def _liste(valeur: Any) -> list:
    if valeur is None:
        return []
    return list(valeur) if isinstance(valeur, (list, tuple)) else [valeur]


def _date(valeur: Any) -> date | None:
    if not valeur:
        return None
    try:
        return date.fromisoformat(str(valeur)[:10])
    except ValueError:
        return None


def convertir(enreg: dict, aujourdhui: date) -> dict | None:
    """Enregistrement BOAMP → champs du modèle `AvisVeille`, ou None s'il ne doit pas être servi."""
    if enreg.get("nature") != "APPEL_OFFRE" or not enreg.get("idweb"):
        return None
    date_limite = _date(enreg.get("datelimitereponse"))
    date_parution = _date(enreg.get("dateparution"))
    if date_limite is None or date_parution is None or date_limite < aujourdhui:
        return None
    departements = sorted({d for d in (normaliser_departement(c) for c in _liste(enreg.get("code_departement"))) if d})
    if not departements:
        return None
    donnees = _donnees(enreg)
    cpv = extraire_cpv(donnees)
    codes = [str(c) for c in _liste(enreg.get("descripteur_code"))]
    libelles = [str(libelle) for libelle in _liste(enreg.get("descripteur_libelle"))]
    descripteurs = [{"code": c, "libelle": libelles[i] if i < len(libelles) else ""} for i, c in enumerate(codes)]
    objet = html.unescape(str(enreg.get("objet") or "")).strip()
    metiers = deduire_metiers(cpv, codes, objet)
    types = [str(t).upper() for t in _liste(enreg.get("type_marche"))]
    if "TRAVAUX" not in types:
        # type de marché non renseigné : on ne garde que ce que le CPV (division 45) ou un métier désigne
        if types or not (any(c.startswith("45") for c in cpv) or metiers != ["autre"]):
            return None
    idweb = str(enreg["idweb"]).strip()
    return {
        "id_boamp": idweb,
        "objet": objet or "(objet non renseigné)",
        "acheteur": html.unescape(str(enreg.get("nomacheteur") or "")).strip()[:500],
        "departements": departements,
        "date_parution": date_parution,
        "date_limite": date_limite,
        "nature": "APPEL_OFFRE",
        "procedure": normaliser_procedure(enreg.get("type_procedure")),
        "procedure_libelle": (str(enreg.get("procedure_libelle") or "")[:120] or None),
        "famille": (str(enreg.get("famille") or "")[:20] or None),
        "descripteurs": descripteurs,
        "codes_cpv": cpv,
        "url_avis": str(enreg.get("url_avis") or URL_AVIS_DEFAUT.format(idweb=idweb))[:500],
        "url_dossier": extraire_url_dossier(donnees),
        "metiers": metiers,
        "_annonce_lie": [str(a) for a in _liste(enreg.get("annonce_lie"))],
        "_corrige": str(enreg.get("etat") or "").upper() == "RECTIFICATIF",
    }


# ── Client HTTP ────────────────────────────────────────────────────────────────────────────────

class ClientBoamp:
    def __init__(self, transport: httpx.BaseTransport | None = None, delai: float = DELAI_S,
                 tentatives: int = TENTATIVES, attente: Callable[[float], None] = time.sleep,
                 url: str = URL_BOAMP) -> None:
        self._client = httpx.Client(transport=transport, timeout=delai, headers={"User-Agent": USER_AGENT})
        self._tentatives = tentatives
        self._attente = attente
        self._url = url

    def close(self) -> None:
        self._client.close()

    def _demander(self, params: dict) -> dict:
        derniere = "inconnue"
        for essai in range(self._tentatives):
            pause = 2.0 * (2 ** essai)                     # attente croissante : 2 s, 4 s, 8 s
            try:
                reponse = self._client.get(self._url, params=params)
            except httpx.HTTPError as exc:
                derniere = type(exc).__name__
            else:
                if reponse.status_code == 200:
                    try:
                        return reponse.json()
                    except ValueError:
                        derniere = "réponse illisible"
                elif reponse.status_code in (429, 500, 502, 503, 504):
                    derniere = f"HTTP {reponse.status_code}"
                    reste = reponse.headers.get("retry-after", "")
                    if reste.isdigit():
                        pause = min(float(reste), 60.0)    # on respecte Retry-After, plafonné
                else:
                    raise ErreurBoamp(f"HTTP {reponse.status_code}")
            if essai + 1 < self._tentatives:
                self._attente(pause)
        raise ErreurBoamp(f"API BOAMP injoignable après {self._tentatives} essais ({derniere})")

    def avis_du_jour(self, jour: date, aujourdhui: date) -> Iterator[dict]:
        where = (
            f"nature='APPEL_OFFRE' AND dateparution=date'{jour.isoformat()}' "
            f"AND datelimitereponse>=date'{aujourdhui.isoformat()}' "
            "AND (type_marche='TRAVAUX' OR type_marche is null)"
        )
        offset = 0
        while offset + PAGE <= 10000:
            corps = self._demander({"where": where, "select": CHAMPS, "order_by": "idweb",
                                    "limit": PAGE, "offset": offset})
            resultats = corps.get("results") or []
            yield from resultats
            if len(resultats) < PAGE:
                return
            offset += PAGE


# ── Synchronisation ────────────────────────────────────────────────────────────────────────────

def _debut(db, aujourdhui: date, depuis: date | None) -> date:
    plancher = aujourdhui - timedelta(days=FENETRE_INITIALE_JOURS)
    if depuis is not None:
        return depuis
    from sqlalchemy import func
    from models.avis_veille import AvisVeille
    dernier = db.query(func.max(AvisVeille.synchronise_at)).scalar()
    if dernier is None:
        return plancher
    return max(plancher, dernier.date() - timedelta(days=1))   # un jour de chevauchement


def _index_connus(db) -> dict:
    """idweb (courant ou ancien) → ligne, pour retrouver un avis déjà connu sous une autre version."""
    from models.avis_veille import AvisVeille
    index: dict = {}
    for ligne in db.query(AvisVeille).all():
        for identifiant in [ligne.id_boamp, *(ligne.ids_lies or [])]:
            index[identifiant] = ligne
    return index


def synchroniser(db, client: ClientBoamp | None = None, depuis: date | None = None, limite: int | None = None,
                 simulation: bool = False, aujourdhui: date | None = None) -> Resultat:
    """Un passage de synchronisation. `simulation` : lit l'API et la base, n'écrit rien, compte."""
    from models.avis_veille import AvisVeille
    from services.veille.comptes import invalider_cache

    aujourdhui = aujourdhui or date.today()
    debut = _debut(db, aujourdhui, depuis)
    resultat = Resultat(simulation=simulation, depuis=debut.isoformat(), jusqu_au=aujourdhui.isoformat())
    propre = client is None
    client = client or ClientBoamp()
    maintenant = datetime.utcnow()
    vus: set[str] = set()
    connus = _index_connus(db)
    try:
        jour = debut
        while jour <= aujourdhui and (limite is None or resultat.retenus < limite):
            for enreg in client.avis_du_jour(jour, aujourdhui):
                resultat.lus += 1
                champs = convertir(enreg, aujourdhui)
                if champs is None or champs["id_boamp"] in vus:
                    resultat.ignores += 1
                    continue
                if limite is not None and resultat.retenus >= limite:
                    break
                annonce_lie = champs.pop("_annonce_lie")
                corrige = champs.pop("_corrige")
                ligne = connus.get(champs["id_boamp"])
                if ligne is not None and champs["id_boamp"] != ligne.id_boamp:
                    resultat.ignores += 1              # ancienne version, déjà remplacée par un avis corrigé
                    continue
                if ligne is None and corrige:
                    # avis corrigé : il porte son propre idweb et pointe la version qu'il remplace
                    ligne = next((connus[a] for a in annonce_lie if a in connus), None)
                vus.add(champs["id_boamp"])
                resultat.retenus += 1
                lies = [champs["id_boamp"], *annonce_lie]
                if ligne is None:
                    resultat.crees += 1
                    ligne = AvisVeille(**champs, ids_lies=lies, synchronise_at=maintenant)
                    if not simulation:
                        db.add(ligne)
                else:
                    resultat.mis_a_jour += 1
                    if not simulation:
                        lies = list(dict.fromkeys([*(ligne.ids_lies or []), ligne.id_boamp, *lies]))
                        for cle, valeur in champs.items():
                            setattr(ligne, cle, valeur)
                        ligne.ids_lies = lies
                        ligne.synchronise_at = maintenant
                for identifiant in lies:
                    connus[identifiant] = ligne
                if not simulation:
                    db.flush()
            if not simulation:
                db.commit()
            jour += timedelta(days=1)
    finally:
        if propre:
            client.close()
    expires = db.query(AvisVeille).filter(AvisVeille.date_limite < aujourdhui)
    resultat.supprimes_expires = expires.count()
    if not simulation:
        expires.delete(synchronize_session=False)
        db.commit()
        invalider_cache()
    logger.info("veille BOAMP : %s", resultat.en_dict())
    return resultat
