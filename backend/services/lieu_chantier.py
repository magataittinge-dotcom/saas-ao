"""Lieu d'exécution du chantier : un fait SOURCÉ, jamais deviné (0 € API).

L'analyse (passe 1, RC + CCAP) peut extraire `infos_marche.lieu_execution` :

    {"adresse": "...", "document": "RC" | "CCAP", "article": "...",
     "extrait": "<phrase exacte du document>"}      ou null

Ce module est le contrôle SANS IA qui suit l'extraction. Le champ n'est gardé
que si :
  1. `document` est « RC » ou « CCAP » (aucune autre pièce) ;
  2. `extrait` se retrouve, mot pour mot après la normalisation de l'ancrage des
     exigences (apostrophes, retours à la ligne, accents, casse), dans le texte
     d'une pièce de ce type ;
  3. `adresse` est contenue dans cet extrait.
Sinon il est écarté : la carte ne montre que le siège de l'entreprise. L'extrait
conservé est le passage RÉEL du document (verbatim), pas la copie de l'IA.
Le journal ne reçoit que des motifs courts, jamais un mot du DCE.

Ancien format (simple chaîne) : toujours refusé, faute de source.
"""
from __future__ import annotations

import logging
import re
from typing import Iterable, Optional

from services.ai.excerpt_anchor import _doc_index, _normalize

logger = logging.getLogger(__name__)

DOCUMENTS_ADMIS = ("RC", "CCAP")   # type de pièce (ProjectDocument.type) en minuscules
_EXTRAIT_MIN, _EXTRAIT_MAX = 10, 500
_ADRESSE_MIN, _ADRESSE_MAX = 5, 200
_ARTICLE_MAX = 60


def _texte(valeur) -> str:
    return " ".join(valeur.split()) if isinstance(valeur, str) else ""


def _contient(extrait: str, adresse: str) -> bool:
    """L'adresse est dans l'extrait, comparés sous la normalisation de l'ancrage."""
    return bool(adresse) and _normalize(adresse).strip() in _normalize(extrait)


def lire_lieu(infos_marche, maitre_ouvrage: Optional[str] = None) -> Optional[dict]:
    """Lieu d'exécution utilisable, lu dans `infos_marche` — ou None.

    Contrôle de forme seul (sans les pièces) : format structuré, pièce citée
    RC ou CCAP, extrait présent, adresse contenue dans l'extrait, adresse
    différente du nom de l'acheteur. Ce que l'analyse a enregistré a déjà passé
    `valider_lieu_execution` (extrait retrouvé dans la pièce)."""
    brut = infos_marche.get("lieu_execution") if isinstance(infos_marche, dict) else None
    if not isinstance(brut, dict):
        return None            # absent, ou ancien format « chaîne » : jamais sans source
    document = _texte(brut.get("document")).upper()
    adresse, extrait = _texte(brut.get("adresse")), _texte(brut.get("extrait"))
    if document not in DOCUMENTS_ADMIS or not extrait or not _contient(extrait, adresse):
        return None
    if adresse.lower() == _texte(maitre_ouvrage).lower():
        return None
    article = _texte(brut.get("article")) or None
    return {"adresse": adresse, "document": document, "article": article, "extrait": extrait}


def libelle_source(lieu: dict) -> str:
    """« RC, art. 2.1 » ou « CCAP » (sans article)."""
    article = re.sub(r"^(articles?|art\.?)\s*", "", (lieu.get("article") or "").strip(), flags=re.I)
    return f"{lieu['document']}, art. {article}" if article else lieu["document"]


def valider_lieu_execution(brut, pieces: Iterable[tuple[str, str]],
                           maitre_ouvrage: Optional[str] = None) -> Optional[dict]:
    """Garde `brut` seulement s'il est sourcé dans les pièces ; sinon None.

    `pieces` : (type de pièce en minuscules — « rc », « ccap »… —, texte)."""
    if brut is None:
        return None

    def ecarte(motif: str):
        logger.info("Lieu d'exécution écarté (%s) : la carte ne montrera que le siège", motif)
        return None

    if not isinstance(brut, dict):
        return ecarte("ancien format sans source")
    document = _texte(brut.get("document")).upper()
    if document not in DOCUMENTS_ADMIS:
        return ecarte("pièce citée autre que RC ou CCAP")
    adresse, extrait = _texte(brut.get("adresse")), _texte(brut.get("extrait"))
    if not (_ADRESSE_MIN <= len(adresse) <= _ADRESSE_MAX) or not (_EXTRAIT_MIN <= len(extrait) <= _EXTRAIT_MAX):
        return ecarte("adresse ou extrait absent ou hors bornes")
    if not _contient(extrait, adresse):
        return ecarte("adresse hors de l'extrait")

    cherche = _normalize(extrait).strip()
    verbatim = None
    for type_piece, texte in pieces:
        if (type_piece or "").lower() != document.lower() or not texte:
            continue
        norm, carte = _doc_index(texte)
        debut = norm.find(cherche)
        if debut >= 0:
            verbatim = texte[carte[debut]:carte[debut + len(cherche) - 1] + 1]
            break
    if verbatim is None:
        return ecarte("extrait introuvable dans la pièce citée")

    lieu = lire_lieu({"lieu_execution": {**brut, "extrait": verbatim}}, maitre_ouvrage)
    if lieu is None:
        return ecarte("adresse identique à l'acheteur ou extrait non conforme")
    lieu["article"] = (lieu["article"] or "")[:_ARTICLE_MAX] or None
    return lieu


def controler_infos_marche(infos_marche, documents, maitre_ouvrage: Optional[str] = None):
    """`infos_marche` dont le lieu d'exécution a passé le contrôle (ou a été
    retiré). `documents` : pièces du projet (`type`, `extracted_text`,
    `is_user_completed`). Une pièce remplie par l'entreprise n'est jamais une source."""
    if not isinstance(infos_marche, dict) or "lieu_execution" not in infos_marche:
        return infos_marche
    pieces = [((d.type or "autre"), d.extracted_text or "") for d in documents
              if not getattr(d, "is_user_completed", False)
              and not (d.extracted_text or "").startswith("[document volumineux")]
    lieu = valider_lieu_execution(infos_marche.get("lieu_execution"), pieces, maitre_ouvrage)
    sortie = {k: v for k, v in infos_marche.items() if k != "lieu_execution"}
    if lieu:
        sortie["lieu_execution"] = lieu
    return sortie
