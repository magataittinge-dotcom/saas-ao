"""Extraction d'informations d'un fichier déposé dans une case de « Mon entreprise » — Haiku 4.5.

Un prompt par case (« extracteur ») : une Kbis ne peut proposer que de l'identité, une liste de matériel que des
lignes de matériel, etc. Le même style que `profile_structurer` : n'extraire QUE ce qui est écrit, omettre le reste,
JSON seul. Le texte reçu ici est DÉJÀ masqué (`services/masquage_rgpd.py`). La garde « mot pour mot » qui suit le
modèle est dans `services/depot_extraction.py`.

`_call_haiku` est la seule fonction qui parle au fournisseur : les tests la remplacent (aucun appel payant).
Les appels passent par `asyncio.to_thread` côté API ; ici le travail tourne déjà dans un thread détaché.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Tuple

from services.couts_ia import HAIKU_4_5

logger = logging.getLogger(__name__)

MODELE = HAIKU_4_5
MAX_TOKENS_SORTIE = 3000

_REGLES = """RÈGLES ABSOLUES :
- Tu n'extrais QUE des informations PRÉSENTES dans le texte. Tu n'ajoutes, ne complètes, ne devines RIEN.
- Un champ sans information dans le texte : tu l'OMETS (pas de null, pas de valeur générique).
- Les valeurs sont recopiées du texte (orthographe corrigée au plus). Les dates s'écrivent AAAA-MM-JJ.
- Le texte peut contenir des étiquettes [EMAIL], [TELEPHONE], [NIR], [IBAN], [DATE_NAISSANCE], [ADRESSE], [NOM] :
  ce sont des données retirées volontairement ; ne les recopie jamais et n'essaie pas de les deviner.
Réponds UNIQUEMENT avec un objet JSON."""

_PROMPTS = {
    "kbis": """Tu lis un extrait Kbis d'une entreprise du bâtiment.
Champs possibles : forme_juridique (texte), capital_social (nombre entier en euros), greffe_rcs (texte, ville du greffe),
adresse_siege (texte), annee_creation (nombre à 4 chiffres, année de début d'activité ou d'immatriculation),
date_extrait (date de délivrance de l'extrait), gerant_nom (nom du dirigeant légal), gerant_titre (sa fonction).""",
    "assurance": """Tu lis une attestation d'assurance d'une entreprise du bâtiment (décennale ou responsabilité civile).
Champs possibles : assureur (texte), numero_contrat (texte), activites_garanties (texte, une phrase),
date_debut (début de la période de validité), date_fin (fin de la période de validité).""",
    "materiel": """Tu lis une liste de matériel, d'engins, de véhicules et d'outillage d'une entreprise du bâtiment.
Champs possibles : materiel (liste de {quantite (entier >= 1), designation (texte court), unite (facultatif), famille (facultatif)})
et vehicules (même forme). Une ligne du texte donne une entrée ; les véhicules (camion, fourgon, utilitaire, voiture, remorque)
vont dans vehicules, le reste dans materiel.""",
    "personnel": """Tu lis un organigramme ou une liste du personnel d'une entreprise du bâtiment.
Tu COMPTES les personnes : tu ne cites AUCUN nom, AUCUN prénom, aucune adresse, aucun numéro.
Champs possibles :
effectifs : liste de {categorie (encadrement | chef_equipe | ouvrier | administratif | apprenti), specialite (facultatif :
métier en minuscules, ex. maçon), effectif (entier, le nombre de personnes)} ;
habilitations : liste de {type (sst | caces | habilitation_electrique | amiante_ss3 | amiante_ss4 | travail_hauteur | autre),
libelle (facultatif, obligatoire pour « autre »), nombre (entier, le nombre de personnes qui la détiennent),
valide_jusqu (facultatif)}.""",
    "fiche_moyens": """Tu lis une fiche déjà rédigée sur les moyens d'une entreprise du bâtiment.
Champs possibles (chacun est un texte court, reformulé proprement sans changer les faits) : activites,
organigramme_description, moyens_informatiques, vehicules, materiel, demarche_qualite.""",
    "certificat": """Tu lis un certificat de qualification, de label ou de certification d'une entreprise du bâtiment
(Qualibat, RGE, QUALIFELEC, ISO, MASE…).
Champs possibles : certificats (liste de {famille (qualification | rge | systeme_management), intitule (texte), organisme (texte),
numero (numéro de certificat), perimetre (codes ou domaines couverts), date_obtention, date_fin}).""",
    "references": """Tu lis une liste de références de chantiers, ou un mémoire technique déjà rédigé.
Champs possibles : references (liste de {intitule (nom du chantier), maitre_ouvrage (texte), adresse (lieu du chantier),
annee (entier à 4 chiffres), montant_ht (nombre en euros), lot (texte), description (une ou deux phrases)}).
Une référence est un chantier réalisé et nommé ; ne retiens pas les chantiers hypothétiques d'exemple.""",
}


def prompt_systeme(extracteur: str) -> str:
    return f"{_PROMPTS[extracteur]}\n\n{_REGLES}"


def _call_haiku(systeme: str, texte: str) -> Tuple[dict, dict]:
    """Un appel Haiku — isolé pour les tests. Retourne (champs, usage)."""
    import anthropic
    from json_repair import repair_json
    from config import get_settings

    client = anthropic.Anthropic(api_key=get_settings().ANTHROPIC_API_KEY)
    reponse = client.messages.create(
        model=MODELE, max_tokens=MAX_TOKENS_SORTIE, system=systeme,
        messages=[{"role": "user", "content": f"Texte du document :\n{texte}"}],
    )
    brut = "".join(b.text for b in reponse.content if hasattr(b, "text"))
    m = re.search(r"\{.*\}", brut, re.DOTALL)
    champs = json.loads(repair_json(m.group(0))) if m else {}
    u = getattr(reponse, "usage", None)

    def _n(nom: str) -> int:
        return int(getattr(u, nom, 0) or 0) if u else 0

    return (champs if isinstance(champs, dict) else {}), {
        "input_tokens": _n("input_tokens"), "output_tokens": _n("output_tokens"),
        "cache_read_input_tokens": _n("cache_read_input_tokens"),
        "cache_creation_input_tokens": _n("cache_creation_input_tokens"),
    }


def extraire(extracteur: str, texte_masque: str) -> Tuple[dict, dict]:
    """(champs bruts du modèle, usage). Les champs ne sont PAS encore filtrés."""
    return _call_haiku(prompt_systeme(extracteur), texte_masque)
