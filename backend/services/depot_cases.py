"""Les huit cases de dépôt de « Mon entreprise » : la source unique (le front n'en garde aucune copie).

Chaque case porte son NOM, ce qu'on y met, ce que Synorix en fera, sa rubrique, le type de pièce du coffre-fort
et l'extracteur qui lit le fichier (schéma strict par case : une Kbis ne propose que de l'identité, une liste de
matériel que des lignes de matériel…). Un fichier déposé dans « Moyens » n'est ainsi jamais pris pour autre chose.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

RUBRIQUES = ("identite", "moyens", "certifications")

# Formats acceptés partout : PDF, Word, Excel, JPEG, PNG. Les anciens formats Word/Excel (.doc, .xls) sont reçus ;
# un .doc n'est pas lisible sans LibreOffice : il entre au coffre-fort avec un message.
EXTENSIONS = (".pdf", ".docx", ".doc", ".xlsx", ".xls", ".jpg", ".jpeg", ".png")
FORMATS_LISIBLES = "PDF, Word, Excel, JPEG ou PNG"
MESSAGE_FORMAT = "Ce fichier n'est pas un PDF, un Word, un Excel ou une image JPEG/PNG."
PLAFOND_OCTETS = 20 * 1024 * 1024
PLAFOND_MO = 20
MAX_FICHIERS_PAR_ENVOI = 10
# Tous les fichiers d'un envoi tiennent dans les 60 Mo que nginx accepte par défaut (deploy/nginx/synorix.conf) :
# aucune règle nginx à ajouter. Au-delà, on dépose en deux fois.
PLAFOND_TOTAL_ENVOI = 55 * 1024 * 1024
PLAFOND_PAGES_LUES = 40

# Types de pièce du coffre-fort que « Qualibat, RGE ou autre label » peut reconnaître par le nom du fichier.
TYPES_CERTIFICAT = ("qualibat", "rge", "caces", "amiante_ss4")


@dataclass(frozen=True)
class CaseDepot:
    id: str
    rubrique: str
    nom: str
    contenu: str         # ce qu'on y met
    usage: str           # ce que Synorix en fera
    type_piece: str      # type du coffre-fort (models.document.DOCUMENT_TYPES)
    categorie: str       # catégorie du coffre-fort
    extracteur: str      # clé du schéma d'extraction (services/depot_extraction.py)
    date_validite: bool  # une pièce datée : sa date de validité est proposée
    personnes: bool = False   # parle de personnes : masquage renforcé, aucun nom conservé


CASES: tuple[CaseDepot, ...] = (
    CaseDepot(
        "kbis", "identite", "Extrait Kbis",
        "Votre extrait Kbis, en PDF ou en photo.",
        "Il est rangé dans votre coffre-fort. Synorix lit la forme juridique, le capital, le greffe, l'adresse du siège "
        "et la date de l'extrait, puis vous les propose : rien n'est enregistré avant votre accord.",
        "kbis", "documents_legaux", "kbis", True),
    CaseDepot(
        "decennale", "identite", "Attestation d'assurance décennale",
        "L'attestation en cours délivrée par votre assureur.",
        "Elle est rangée dans votre coffre-fort avec sa date de validité : c'est une pièce à renouveler. Synorix lit "
        "l'assureur, le numéro de contrat, les activités garanties et les dates, puis vous les propose.",
        "decennale", "assurances", "assurance", True),
    CaseDepot(
        "rc", "identite", "Attestation de responsabilité civile",
        "L'attestation de responsabilité civile professionnelle en cours.",
        "Elle est rangée dans votre coffre-fort avec sa date de validité : c'est une pièce à renouveler. Synorix lit "
        "l'assureur, le numéro de contrat, les activités garanties et les dates, puis vous les propose.",
        "rc_civile", "assurances", "assurance", True),
    CaseDepot(
        "materiel", "moyens", "Liste du matériel ou inventaire",
        "Un tableur ou un PDF qui liste vos engins, véhicules et outillage.",
        "Il est rangé dans votre coffre-fort. Synorix lit chaque ligne et propose la liste du matériel et des véhicules "
        "de votre profil.",
        "autre", "references_moyens", "materiel", False),
    CaseDepot(
        "personnel", "moyens", "Organigramme ou liste du personnel",
        "Votre organigramme, ou une liste de vos équipes. Un CV est accepté.",
        "Il est rangé dans votre coffre-fort. Synorix compte les personnes par rôle et par habilitation. Les coordonnées, "
        "dates de naissance et numéros personnels sont retirés avant toute analyse ; aucun nom n'est proposé ni conservé "
        "dans votre profil.",
        "organigramme_doc", "references_moyens", "personnel", False, personnes=True),
    CaseDepot(
        "fiche_moyens", "moyens", "Fiche des moyens déjà faite (PDF ou Word)",
        "Un document déjà rédigé sur vos moyens humains et matériels.",
        "Il est rangé dans votre coffre-fort. Synorix lit les rubriques (matériel, véhicules, informatique, équipe, "
        "démarche qualité) et les propose à vos champs de texte.",
        "autre", "references_moyens", "fiche_moyens", False),
    CaseDepot(
        "certificat", "certifications", "Certificat Qualibat, RGE ou autre label",
        "Le certificat ou l'attestation de qualification, de label ou de certification.",
        "Il est rangé dans votre coffre-fort avec sa date de fin, surveillée pour vous. Synorix lit l'intitulé, "
        "l'organisme, le numéro, le périmètre et les dates, puis propose d'ajouter la qualification.",
        "autre", "qualifications", "certificat", True),
    CaseDepot(
        "references", "certifications", "Liste de références ou ancien mémoire technique",
        "Une liste de chantiers, ou un mémoire technique déjà rédigé pour un autre marché.",
        f"Il est rangé dans votre coffre-fort. Synorix repère les chantiers cités (intitulé, maître d'ouvrage, année, "
        f"montant) et propose de les ajouter à vos références. La lecture va jusqu'à {PLAFOND_PAGES_LUES} pages.",
        "autre", "references_moyens", "references", False),
)

_PAR_ID = {c.id: c for c in CASES}


def case_par_id(case_id: str) -> Optional[CaseDepot]:
    return _PAR_ID.get(case_id)


def cases_de(rubrique: Optional[str] = None) -> tuple[CaseDepot, ...]:
    return tuple(c for c in CASES if rubrique is None or c.rubrique == rubrique)


def definition_publique(c: CaseDepot) -> dict:
    """Ce que le front reçoit : jamais le schéma d'extraction ni le type interne."""
    return {
        "id": c.id, "rubrique": c.rubrique, "nom": c.nom, "contenu": c.contenu, "usage": c.usage,
        "formats": list(EXTENSIONS), "plafond_mo": PLAFOND_MO, "plusieurs_fichiers": True,
        "max_fichiers": MAX_FICHIERS_PAR_ENVOI,
    }
