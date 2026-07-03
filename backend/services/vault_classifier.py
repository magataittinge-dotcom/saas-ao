"""
Classement déterministe du coffre-fort (0 € API) — catégories + états honnêtes.

Principe : « valid » signifie « document reconnu ET daté », jamais « fichier
reçu ». Un fichier non reconnu reste "unclassified" tant que l'utilisateur ne
l'a pas classé lui-même.
"""
import unicodedata
from datetime import date
from typing import Optional

EXPIRING_SOON_DAYS = 30

# type de document → catégorie du coffre-fort
TYPE_TO_CATEGORY: dict = {
    # Attestations sociales & fiscales
    "urssaf": "attestations_sociales_fiscales",
    "fiscal": "attestations_sociales_fiscales",
    "pro_btp": "attestations_sociales_fiscales",
    "cibtp": "attestations_sociales_fiscales",
    # Documents légaux
    "kbis": "documents_legaux",
    "rib": "documents_legaux",
    "pouvoir": "documents_legaux",
    "declaration_honneur": "documents_legaux",
    "dume": "documents_legaux",
    # Assurances
    "decennale": "assurances",
    "rc_civile": "assurances",
    "trc": "assurances",
    "dommages_ouvrage": "assurances",
    # Qualifications / habilitations
    "qualibat": "qualifications",
    "rge": "qualifications",
    "caces": "qualifications",
    "amiante_ss4": "qualifications",
    # Capacités / références / moyens
    "chiffre_affaires": "references_moyens",
    "effectifs": "references_moyens",
    "organigramme_doc": "references_moyens",
    "attestation_travaux": "references_moyens",
    # Classement manuel volontaire hors cases
    "autre": "autres",
}

# Cascade de mots-clés (sur le nom de fichier normalisé sans accents).
# Ordre = priorité : les motifs les plus spécifiques d'abord.
_KEYWORD_RULES: list = [
    ("urssaf", ["urssaf", "vigilance"]),
    ("pro_btp", ["pro btp", "probtp", "pro-btp", "pro_btp"]),
    ("cibtp", ["cibtp", "conges payes", "caisse conges"]),
    ("fiscal", ["fiscal", "impots", "regularite"]),
    ("kbis", ["kbis", "k-bis", "k bis", "extrait k"]),
    ("rib", ["rib", "iban", "releve d'identite bancaire", "releve identite bancaire"]),
    ("pouvoir", ["pouvoir", "delegation de signature"]),
    ("declaration_honneur", ["declaration sur l'honneur", "declaration honneur"]),
    ("dume", ["dume"]),
    ("decennale", ["decennale", "garantie decennale"]),
    ("dommages_ouvrage", ["dommages ouvrage", "dommages-ouvrage"]),
    ("trc", ["trc", "tous risques chantier"]),
    ("rc_civile", ["rc pro", "rc_pro", "rc-pro", "responsabilite civile", "rc civile", "rc_civile"]),
    ("qualibat", ["qualibat"]),
    ("rge", ["rge", "reconnu garant"]),
    ("caces", ["caces"]),
    ("amiante_ss4", ["amiante", "ss4", "sous-section 4", "sous section 4"]),
    ("chiffre_affaires", ["chiffre d'affaires", "chiffre affaires", "chiffres d'affaires"]),
    ("effectifs", ["effectif"]),
    ("organigramme_doc", ["organigramme"]),
    ("attestation_travaux", ["attestation de travaux", "attestation travaux"]),
]


def _normalize(text: str) -> str:
    """minuscules + accents retirés — la détection tolère « décennale »/« decennale »."""
    nfkd = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def detect_vault_type(filename: str) -> str:
    """Détecte le type de document coffre-fort depuis le nom de fichier.

    Retourne "autre" si rien n'est reconnu — l'appelant traduit alors en
    catégorie/statut "unclassified", JAMAIS en « valide »."""
    name = _normalize(filename or "")
    for doc_type, keywords in _KEYWORD_RULES:
        if any(kw in name for kw in keywords):
            return doc_type
    return "autre"


def category_for_type(doc_type: str) -> str:
    return TYPE_TO_CATEGORY.get(doc_type, "autres")


def compute_document_status(doc_type: Optional[str], expiry_date: Optional[date],
                            today: Optional[date] = None) -> str:
    """État honnête d'un document du coffre-fort.

    • type non reconnu ("autre"/None) → "unclassified" (jamais de validité)
    • type reconnu sans date          → "unverified" (date à saisir)
    • type reconnu + date             → valid / expiring_soon / expired
    """
    if not doc_type or doc_type == "autre":
        return "unclassified"
    if expiry_date is None:
        return "unverified"
    days_left = (expiry_date - (today or date.today())).days
    if days_left < 0:
        return "expired"
    if days_left <= EXPIRING_SOON_DAYS:
        return "expiring_soon"
    return "valid"
