"""Réception des rapports de la CSP du front en observation (``Content-Security-Policy-Report-Only``).

``POST /api/csp-rapport`` — publique (le navigateur n'envoie aucun jeton), donc :
- corps plafonné à 8 Ko, lu par morceaux et abandonné au premier octet de trop (jamais chargé
  en entier) ; 413 au-delà ;
- types acceptés : ``application/csp-report`` (``report-uri``) et ``application/reports+json``
  (``report-to``), 415 sinon ; JSON validé par Pydantic, 400 si illisible ;
- limite de débit par adresse IP (clé de repli du limiter partagé ; derrière nginx l'IP vient de
  ``--forwarded-allow-ips 127.0.0.1``) ;
- RGPD : seules la DIRECTIVE violée et l'ORIGINE bloquée (schéma + hôte) sont journalisées —
  jamais le chemin, la requête ni le fragment de l'URL bloquée, jamais l'adresse de la page ni
  l'en-tête, jamais l'IP. Les valeurs sont validées avant d'entrer dans le journal (pas
  d'injection de lignes) ;
- un compteur par directive (mémoire du processus) permet de voir ce qui bloquerait avant de
  passer la CSP en mode bloquant.
Réponse : 204, sans corps.
"""
import json
import logging
import re
import threading
from collections import Counter
from typing import List, Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from services.rate_limit import limiter

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_CORPS_OCTETS = 8 * 1024
LIMITE_DEBIT = "60/minute"
TYPES_ACCEPTES = ("application/csp-report", "application/reports+json")
MAX_RAPPORTS_PAR_ENVOI = 10

_DIRECTIVE = re.compile(r"^[a-z][a-z-]{0,39}$")
_SCHEMA = re.compile(r"^[a-z][a-z0-9+.-]{0,15}$")
_HOTE = re.compile(r"^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$")
_MOTS_CLES = {"inline", "eval", "wasm-eval", "data", "blob", "about", "self",
              "trusted-types-policy", "trusted-types-sink"}
_MAX_DIRECTIVES_SUIVIES = 64


# ─── Formats des deux types de rapport (champs utiles seulement, le reste est ignoré) ──────────

class _RapportLegacy(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)
    violated_directive: str = Field("", alias="violated-directive")
    effective_directive: str = Field("", alias="effective-directive")
    blocked_uri: str = Field("", alias="blocked-uri")


class _EnveloppeLegacy(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)
    csp_report: _RapportLegacy = Field(alias="csp-report")


class _CorpsModerne(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)
    effective_directive: str = Field("", alias="effectiveDirective")
    violated_directive: str = Field("", alias="violatedDirective")
    blocked_url: str = Field("", alias="blockedURL")


class _RapportModerne(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: str = ""
    body: Optional[_CorpsModerne] = None


# ─── Valeurs journalisables ──────────────────────────────────────────────────────────────────

def directive_sure(brut: str) -> str:
    """Nom de directive (« script-src-elem »), sans la valeur de la source qui suit."""
    nom = (brut or "").strip().split(" ", 1)[0].lower()
    return nom if _DIRECTIVE.match(nom) else "inconnue"


def origine_sure(brut: str) -> str:
    """Schéma + hôte de l'URL bloquée. Jamais le chemin, la requête ni le fragment."""
    valeur = (brut or "").strip()
    if not valeur:
        return "inconnue"
    mot = valeur.split(":", 1)[0].lower()
    if mot in _MOTS_CLES:
        return mot
    if valeur.lower() in _MOTS_CLES:
        return valeur.lower()
    try:
        parts = urlsplit(valeur)
        schema, hote = (parts.scheme or "").lower(), (parts.hostname or "").lower()
    except ValueError:
        return "autre"
    if _SCHEMA.match(schema) and _HOTE.match(hote):
        return f"{schema}://{hote}"
    return "autre"


# ─── Compteur par directive ──────────────────────────────────────────────────────────────────

_verrou = threading.Lock()
_compteurs: Counter = Counter()


def compter(directive: str) -> int:
    with _verrou:
        if directive not in _compteurs and len(_compteurs) >= _MAX_DIRECTIVES_SUIVIES:
            directive = "autre"
        _compteurs[directive] += 1
        return _compteurs[directive]


def compteurs_csp() -> dict:
    with _verrou:
        return dict(_compteurs)


# ─── Lecture bornée du corps ────────────────────────────────────────────────────────────────

async def _lire_corps_borne(request: Request) -> bytes:
    declare = request.headers.get("content-length")
    if declare and declare.isdigit() and int(declare) > MAX_CORPS_OCTETS:
        raise HTTPException(status_code=413, detail="Rapport trop volumineux.")
    morceaux: List[bytes] = []
    total = 0
    async for morceau in request.stream():
        total += len(morceau)
        if total > MAX_CORPS_OCTETS:
            raise HTTPException(status_code=413, detail="Rapport trop volumineux.")
        morceaux.append(morceau)
    return b"".join(morceaux)


def _violations(type_contenu: str, donnees) -> List[tuple]:
    """[(directive, origine), …] depuis l'un ou l'autre format."""
    if type_contenu == "application/csp-report":
        r = _EnveloppeLegacy.model_validate(donnees).csp_report
        return [(directive_sure(r.effective_directive or r.violated_directive),
                 origine_sure(r.blocked_uri))]
    if not isinstance(donnees, list):
        raise ValueError("liste de rapports attendue")
    sorties = []
    for brut in donnees[:MAX_RAPPORTS_PAR_ENVOI]:
        r = _RapportModerne.model_validate(brut)
        if r.type == "csp-violation" and r.body is not None:
            sorties.append((directive_sure(r.body.effective_directive or r.body.violated_directive),
                            origine_sure(r.body.blocked_url)))
    return sorties


@router.post("/csp-rapport", status_code=204)
@limiter.limit(LIMITE_DEBIT)
async def recevoir_rapport_csp(request: Request) -> Response:
    type_contenu = (request.headers.get("content-type") or "").split(";", 1)[0].strip().lower()
    if type_contenu not in TYPES_ACCEPTES:
        raise HTTPException(status_code=415, detail="Type de rapport non accepté.")
    corps = await _lire_corps_borne(request)
    try:
        violations = _violations(type_contenu, json.loads(corps))
    except (ValueError, ValidationError):
        raise HTTPException(status_code=400, detail="Rapport illisible.")
    for directive, origine in violations:
        n = compter(directive)
        logger.info("CSP (observation) : directive=%s origine=%s n_directive=%d", directive, origine, n)
    return Response(status_code=204)
