"""
Vérification SIRET via l'API Sirene (C2).

Source : API publique « Recherche d'entreprises » de l'État
(https://recherche-entreprises.api.gouv.fr) — gratuite, sans clé d'API.
Elle expose les données du répertoire Sirene de l'INSEE ; pas besoin de
SIRENE_API_KEY tant que cet endpoint public existe.

Contrat d'échec (l'appelant décide, l'inscription n'est JAMAIS bloquée en dur) :
  • SiretFormatError       → format invalide (longueur / non numérique / Luhn)
  • SiretNotFoundError     → SIRET absent du répertoire Sirene
  • SireneUnavailableError → API injoignable après retries (dégradation gracieuse)
"""
import logging
import time
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_API_URL = "https://recherche-entreprises.api.gouv.fr/search"
_TIMEOUT_S = 5.0
_MAX_ATTEMPTS = 2
_RETRY_DELAY_S = 1.0

# Tranches d'effectif INSEE → libellés lisibles.
_EFFECTIF_LABELS = {
    "NN": "Effectif non renseigné",
    "00": "0 salarié",
    "01": "1 ou 2 salariés",
    "02": "3 à 5 salariés",
    "03": "6 à 9 salariés",
    "11": "10 à 19 salariés",
    "12": "20 à 49 salariés",
    "21": "50 à 99 salariés",
    "22": "100 à 199 salariés",
    "31": "200 à 249 salariés",
    "32": "250 à 499 salariés",
    "41": "500 à 999 salariés",
    "42": "1 000 à 1 999 salariés",
    "51": "2 000 à 4 999 salariés",
    "52": "5 000 à 9 999 salariés",
    "53": "10 000 salariés et plus",
}


class SiretFormatError(ValueError):
    """SIRET mal formé (longueur, caractères ou clé de Luhn)."""


class SiretNotFoundError(Exception):
    """SIRET introuvable dans le répertoire Sirene."""


class SireneUnavailableError(Exception):
    """API Sirene injoignable (timeout, 5xx, réseau)."""


@dataclass
class SireneInfo:
    siret: str
    raison_sociale: Optional[str]
    adresse: Optional[str]
    naf_code: Optional[str]
    effectif_tranche: Optional[str]


def _luhn_valid(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def normalize_siret(raw: str) -> str:
    """Nettoie et valide un SIRET (14 chiffres + clé de Luhn).

    Exception connue : les SIRET de La Poste (siren 356000000) ne respectent
    pas la règle de Luhn."""
    cleaned = (raw or "").replace(" ", "").replace("-", "").strip()
    if len(cleaned) != 14 or not cleaned.isdigit():
        raise SiretFormatError("Le SIRET doit comporter exactement 14 chiffres.")
    if not cleaned.startswith("356000000") and not _luhn_valid(cleaned):
        raise SiretFormatError("Numéro SIRET invalide (clé de contrôle incorrecte).")
    return cleaned


def _fetch_sirene(siret: str) -> dict:
    """Un appel HTTP à l'API publique — isolé pour les tests et les retries."""
    try:
        resp = httpx.get(
            _API_URL,
            params={"q": siret, "per_page": 1, "page": 1},
            timeout=_TIMEOUT_S,
            headers={"Accept": "application/json"},
        )
    except httpx.HTTPError as exc:
        raise SireneUnavailableError(f"API Sirene injoignable : {exc}") from exc
    if resp.status_code >= 500:
        raise SireneUnavailableError(f"API Sirene en erreur ({resp.status_code})")
    if resp.status_code != 200:
        # 4xx inattendu (throttling…) → traité comme indisponibilité, pas comme
        # une preuve d'inexistence du SIRET.
        raise SireneUnavailableError(f"Réponse inattendue de l'API Sirene ({resp.status_code})")
    return resp.json()


def lookup_siret(siret: str) -> SireneInfo:
    """SIRET (déjà normalisé) → informations entreprise du répertoire Sirene."""
    payload = None
    last_error: Optional[Exception] = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            payload = _fetch_sirene(siret)
            break
        except SireneUnavailableError as exc:
            last_error = exc
            if attempt < _MAX_ATTEMPTS - 1:
                time.sleep(_RETRY_DELAY_S)
    if payload is None:
        logger.warning("Sirene indisponible pour %s : %s", siret, last_error)
        raise last_error or SireneUnavailableError("API Sirene indisponible")

    results = payload.get("results") or []
    if not results:
        raise SiretNotFoundError(f"SIRET {siret} introuvable au répertoire Sirene.")

    company = results[0]
    siege = company.get("siege") or {}
    # L'établissement exact demandé si l'API l'a matché, sinon le siège.
    etablissements = company.get("matching_etablissements") or []
    etab = next((e for e in etablissements if e.get("siret") == siret), None) or siege

    effectif_code = etab.get("tranche_effectif_salarie") or company.get("tranche_effectif_salarie")
    return SireneInfo(
        siret=siret,
        raison_sociale=company.get("nom_raison_sociale") or company.get("nom_complet"),
        adresse=etab.get("adresse"),
        naf_code=etab.get("activite_principale") or company.get("activite_principale"),
        effectif_tranche=_EFFECTIF_LABELS.get(effectif_code) if effectif_code else None,
    )
