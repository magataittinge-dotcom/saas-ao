"""État de chaque case de dépôt : ce que le patron lit sous la case après un dépôt.

« Lu · 6 informations proposées » (puis « Vérifier »), « Déposé dans le coffre-fort » quand il n'y a rien à
extraire, « Déposé dans le coffre-fort · lisible seulement avec un OCR », « En lecture… ». Les libellés sont
écrits ici, une fois : le front les affiche tels quels."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from models.depot_entreprise import LectureDepot, PropositionProfil
from models.document import Document
from services.depot_cases import CASES, CaseDepot, cases_de, definition_publique

# Une lecture « en cours » depuis plus longtemps que cela n'a plus de fil qui la porte (redémarrage du serveur) :
# elle passe à « à relancer » au premier affichage, jamais « en lecture » pour toujours.
DELAI_LECTURE_ABANDONNEE = timedelta(minutes=20)
MESSAGE_LECTURE_INTERROMPUE = "La lecture a été interrompue. Redéposez le fichier pour la relancer."

LIBELLE_COFFRE = "Déposé dans le coffre-fort"
LIBELLE_OCR = "Déposé dans le coffre-fort · lisible seulement avec un OCR"
LIBELLE_EN_LECTURE = "En lecture…"


def _pluriel(n: int) -> str:
    return f"{n} information proposée" if n == 1 else f"{n} informations proposées"


def libelle_lu(n: int) -> str:
    return f"Lu · {_pluriel(n)}"


def reprendre_lectures_abandonnees(db: Session, org_id: str, fils_vivants: bool = False) -> None:
    """Les lectures « en lecture » trop anciennes passent à « echec » (message : redéposer)."""
    limite = datetime.utcnow() - DELAI_LECTURE_ABANDONNEE
    vieilles = db.query(LectureDepot).filter(
        LectureDepot.organization_id == org_id, LectureDepot.etat == "en_lecture",
        LectureDepot.created_at < limite).all()
    for l in vieilles:
        l.etat, l.message, l.terminee_le = "echec", MESSAGE_LECTURE_INTERROMPUE, datetime.utcnow()
    if vieilles:
        db.commit()


def _fichier(l: LectureDepot, nom: str, en_attente: int) -> dict:
    # Lu sans rien à proposer : pour le patron, c'est « Déposé dans le coffre-fort ».
    etat = "coffre_seul" if l.etat == "lu" and not l.nb_propositions else l.etat
    return {
        "lecture_id": l.id, "document_id": l.document_id, "nom": nom, "etat": etat, "message": l.message,
        "propositions": en_attente, "pages_lues": l.pages_lues, "pages_total": l.pages_total,
        "plafond_atteint": bool(l.plafond_atteint),
        "depose_le": l.created_at.isoformat() if l.created_at else None,
    }


def etat_case(db: Session, org_id: str, case: CaseDepot) -> dict:
    lectures = (
        db.query(LectureDepot, Document.file_name)
        .join(Document, Document.id == LectureDepot.document_id)
        .filter(LectureDepot.organization_id == org_id, LectureDepot.case_depot == case.id,
                Document.deleted_at.is_(None), Document.organization_id == org_id)
        .order_by(LectureDepot.created_at.desc()).limit(20).all()
    )
    en_attente: dict[str, int] = {}
    if lectures:
        lignes = db.query(PropositionProfil.lecture_id).filter(
            PropositionProfil.organization_id == org_id, PropositionProfil.case_depot == case.id,
            PropositionProfil.statut == "proposee").all()
        for (lecture_id,) in lignes:
            en_attente[lecture_id] = en_attente.get(lecture_id, 0) + 1
    fichiers = [_fichier(l, nom, en_attente.get(l.id, 0)) for l, nom in lectures]
    total = sum(f["propositions"] for f in fichiers)
    etats = [f["etat"] for f in fichiers]
    notes = [f["message"] for f in fichiers if f["message"] and f["etat"] in ("coffre_seul", "ocr_requis", "echec")]
    plafond = next((f for f in fichiers if f["plafond_atteint"]), None)

    if not fichiers:
        etat, libelle, vers_verifier = "vide", None, False
    elif "en_lecture" in etats:
        etat, libelle, vers_verifier = "en_lecture", LIBELLE_EN_LECTURE, False
    elif total > 0:
        etat, libelle, vers_verifier = "lu", libelle_lu(total), True
    elif "lu" in etats:
        etat, libelle, vers_verifier = "traite", "Lu · informations traitées", False
    elif "ocr_requis" in etats:
        etat, libelle, vers_verifier = "ocr_requis", LIBELLE_OCR, False
    elif "echec" in etats and "coffre_seul" not in etats:
        etat, libelle, vers_verifier = "echec", LIBELLE_COFFRE, False
    else:
        etat, libelle, vers_verifier = "coffre_seul", LIBELLE_COFFRE, False
    return {
        **definition_publique(case),
        "etat": etat, "libelle_etat": libelle, "vers_verifier": vers_verifier, "propositions": total,
        "note": notes[0] if notes else None,
        "plafond": (f"Lu jusqu'à la page {plafond['pages_lues']}" if plafond and plafond["pages_lues"] else None),
        "fichiers": fichiers,
    }


def etats(db: Session, org_id: str, rubrique: Optional[str] = None) -> list[dict]:
    reprendre_lectures_abandonnees(db, org_id)
    return [etat_case(db, org_id, c) for c in cases_de(rubrique)]
