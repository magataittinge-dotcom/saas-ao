"""Validation des propositions du dépôt : le SEUL endroit où une proposition entre dans le profil.

Le patron coche ce qui est juste ; les propositions cochées sont écrites par les MÊMES règles que les formulaires
(schémas Pydantic de `PATCH /organizations/me`, `PUT /memoire-config`, `/qualifications`, `/references`, et le
calcul de statut du coffre-fort de `PATCH /documents/{id}`) ; les autres propositions de la même lecture sont écartées.

- Une valeur qui ne passe pas la validation du champ est écartée et rendue dans `erreurs` : rien n'est écrit à moitié.
- Tout est écrit dans UNE transaction : une erreur imprévue n'écrit rien.
- Valider deux fois la même proposition est sans effet la seconde (elle n'est plus « proposée »).
- Les listes (matériel, véhicules, effectifs, habilitations) FUSIONNENT : une ligne du même nom est mise à jour, les
  autres lignes du profil ne bougent pas.
- La date de validité d'une attestation ou d'un certificat est posée sur la pièce du coffre-fort, dont le statut est
  recalculé ; la qualification créée garde cette pièce comme justificatif.
Aucun nom de personne n'existe dans une proposition (D2) : il n'y en a donc pas à écrire.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Any, Optional

from pydantic import ValidationError
from sqlalchemy.orm import Session

from models.depot_entreprise import LectureDepot, PropositionProfil
from models.document import Document
from models.memoire_config import MemoireConfig
from models.organization import Organization
from models.qualification import Qualification
from models.reference import Reference
from schemas.memoire_config import MemoireConfigUpdate
from schemas.organization import OrganizationUpdate
from schemas.qualification import QualificationCreate
from services.ai.profile_structurer import _norm
from services.vault_classifier import compute_document_status

logger = logging.getLogger(__name__)


class PropositionRefusee(ValueError):
    """La valeur ne passe pas la validation du champ ; le message est écrit pour le patron."""


def _message(exc: ValidationError) -> str:
    erreur = exc.errors()[0] if exc.errors() else {}
    return f"valeur refusée ({erreur.get('msg', 'invalide')})"


def _egal(a: Any, b: Any) -> bool:
    return _norm(str(a if a is not None else "")).strip() == _norm(str(b if b is not None else "")).strip()


def _config(db: Session, org_id: str) -> MemoireConfig:
    c = db.query(MemoireConfig).filter(MemoireConfig.organization_id == org_id).first()
    if c is None:
        c = MemoireConfig(organization_id=org_id)
        db.add(c)
        db.flush()
    return c


def _ecrire_organisation(db: Session, org_id: str, champ: str, valeur: Any) -> None:
    org = db.get(Organization, org_id)
    try:
        changes = OrganizationUpdate(**{champ: valeur}).model_dump(exclude_unset=True)
    except ValidationError as exc:
        raise PropositionRefusee(_message(exc))
    for nom, v in changes.items():
        setattr(org, nom, v)


def _ecrire_profil(db: Session, org_id: str, champ: str, valeur: Any) -> None:
    config = _config(db, org_id)
    if champ in _LISTES_PROFIL:
        valeur = _fusionner_ligne(getattr(config, champ), champ, valeur)
    try:
        changes = MemoireConfigUpdate(**{champ: valeur}).model_dump(exclude_unset=True)
    except ValidationError as exc:
        raise PropositionRefusee(_message(exc))
    for nom, v in changes.items():
        setattr(config, nom, v)
    config.updated_at = datetime.utcnow()


# Listes du profil : (champ -> clé d'identité d'une ligne)
def _cle_moyen(l: dict) -> str:
    return _norm(str(l.get("designation") or "")).strip()


def _cle_effectif(l: dict) -> tuple:
    return (l.get("categorie"), _norm(str(l.get("specialite") or "")).strip())


def _cle_habilitation(l: dict) -> tuple:
    return (l.get("type"), _norm(str(l.get("libelle") or "")).strip() if l.get("type") == "autre" else "")


_LISTES_PROFIL = {
    "materiel_liste": _cle_moyen, "vehicules_liste": _cle_moyen,
    "effectifs_par_categorie": _cle_effectif, "habilitations": _cle_habilitation,
}


def _fusionner_ligne(existantes: Optional[list], champ: str, ligne: dict) -> list:
    """La liste du profil avec la ligne proposée : même ligne -> mise à jour, sinon ajout. Rien n'est retiré."""
    cle = _LISTES_PROFIL[champ]
    liste = [dict(l) for l in (existantes or []) if isinstance(l, dict)]
    for i, l in enumerate(liste):
        if cle(l) == cle(ligne):
            liste[i] = {**l, **ligne}
            return liste
    liste.append(dict(ligne))
    return liste


def _document(db: Session, org_id: str, document_id: str) -> Document:
    doc = db.query(Document).filter(
        Document.id == document_id, Document.organization_id == org_id, Document.deleted_at.is_(None)).first()
    if doc is None:
        raise PropositionRefusee("la pièce du coffre-fort n'existe plus")
    return doc


def _ecrire_date_piece(db: Session, org_id: str, prop: PropositionProfil, valeur: Any) -> None:
    doc = _document(db, org_id, prop.document_id)
    try:
        d = date.fromisoformat(str(valeur))
    except ValueError:
        raise PropositionRefusee("date illisible")
    if prop.champ == "document.issued_date":
        doc.issued_date = d
    else:
        doc.expiry_date = d
    # comme PATCH /documents/{id} : le statut est recalculé honnêtement
    doc.status = compute_document_status(doc.type, doc.expiry_date, issued_date=doc.issued_date)


def _ecrire_qualification(db: Session, org_id: str, prop: PropositionProfil, valeur: dict) -> None:
    _document(db, org_id, prop.document_id)       # le justificatif est une pièce de CETTE entreprise
    try:
        q = QualificationCreate(**{**valeur, "document_id": prop.document_id})
    except ValidationError as exc:
        raise PropositionRefusee(_message(exc))
    existante = next((x for x in db.query(Qualification).filter(
        Qualification.organization_id == org_id, Qualification.deleted_at.is_(None),
        Qualification.famille == q.famille).all() if _egal(x.intitule, q.intitule)), None)
    if existante is None:
        db.add(Qualification(organization_id=org_id, **q.model_dump()))
        return
    changes = {nom: v for nom, v in q.model_dump().items() if v is not None}
    debut = changes.get("date_obtention", existante.date_obtention)
    fin = changes.get("date_fin", existante.date_fin)
    if debut and fin and fin < debut:
        raise PropositionRefusee("la date de fin ne peut pas précéder la date d'obtention")
    for nom, v in changes.items():
        setattr(existante, nom, v)


def _ecrire_reference(db: Session, org_id: str, valeur: dict) -> None:
    from routers.references import ReferenceCreate     # le schéma de POST /references
    try:
        payload = ReferenceCreate(**valeur)
    except ValidationError as exc:
        raise PropositionRefusee(_message(exc))
    deja = any(_egal(r.intitule, payload.intitule) for r in db.query(Reference).filter(
        Reference.organization_id == org_id, Reference.deleted_at.is_(None)).all())
    if not deja:
        db.add(Reference(organization_id=org_id, **payload.model_dump()))


def appliquer(db: Session, org_id: str, prop: PropositionProfil) -> None:
    """Écrit UNE proposition dans le profil (sans commit). Lève `PropositionRefusee`."""
    valeur = json.loads(prop.valeur)
    source, _, nom = prop.champ.partition(".")
    if source == "organisation":
        _ecrire_organisation(db, org_id, nom, valeur)
    elif source == "profil":
        _ecrire_profil(db, org_id, nom, valeur)
    elif source == "document":
        _ecrire_date_piece(db, org_id, prop, valeur)
    elif prop.champ == "qualification":
        _ecrire_qualification(db, org_id, prop, valeur)
    elif prop.champ == "reference":
        _ecrire_reference(db, org_id, valeur)
    else:
        raise PropositionRefusee("champ inconnu")


def _propositions_de(db: Session, org_id: str, ids: list[str]) -> list[PropositionProfil]:
    """Les propositions de CETTE entreprise ; un identifiant inconnu ou d'une autre entreprise lève `KeyError`
    (la route répond 404 sans dire lequel)."""
    ids = list(dict.fromkeys(ids))
    trouvees = db.query(PropositionProfil).filter(
        PropositionProfil.organization_id == org_id, PropositionProfil.id.in_(ids)).all() if ids else []
    if len(trouvees) != len(ids):
        raise KeyError("proposition introuvable")
    return trouvees


def _lectures_de(db: Session, org_id: str, lecture_ids: list[str]) -> set[str]:
    """Les lectures de CETTE entreprise (404 sinon : même réponse qu'un identifiant inconnu)."""
    lecture_ids = list(dict.fromkeys(lecture_ids))
    if not lecture_ids:
        return set()
    trouvees = {l for (l,) in db.query(LectureDepot.id).filter(
        LectureDepot.organization_id == org_id, LectureDepot.id.in_(lecture_ids)).all()}
    if len(trouvees) != len(lecture_ids):
        raise KeyError("lecture introuvable")
    return trouvees


def valider(db: Session, org_id: str, ids: list[str], lecture_ids: Optional[list[str]] = None) -> dict:
    """Écrit les propositions cochées, écarte les autres de la même lecture (et de `lecture_ids`, les lectures affichées :
    rien de coché dans une lecture, c'est tout écarter). Une seule transaction."""
    cochees = [p for p in _propositions_de(db, org_id, ids) if p.statut == "proposee"]
    affichees = _lectures_de(db, org_id, lecture_ids or [])
    maintenant = datetime.utcnow()
    ecrites, erreurs = 0, []
    try:
        for p in cochees:
            try:
                appliquer(db, org_id, p)     # chaque écriture valide AVANT d'écrire : un refus ne laisse rien
            except PropositionRefusee as exc:
                erreurs.append({"id": p.id, "libelle": p.libelle, "message": str(exc)})
                p.statut, p.decidee_le = "ecartee", maintenant
                continue
            p.statut, p.decidee_le = "validee", maintenant
            ecrites += 1
        db.flush()      # la session n'écrit pas toute seule : les statuts posés plus haut doivent être vus par la requête
        lectures = {p.lecture_id for p in cochees} | affichees
        autres = db.query(PropositionProfil).filter(
            PropositionProfil.organization_id == org_id, PropositionProfil.lecture_id.in_(lectures),
            PropositionProfil.statut == "proposee").all() if lectures else []
        for p in autres:
            p.statut, p.decidee_le = "ecartee", maintenant
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"validees": ecrites, "ecartees": len(autres) + len(erreurs), "erreurs": erreurs,
            "rubriques": sorted({p.rubrique for p in cochees})}


def ecarter(db: Session, org_id: str, ids: list[str]) -> dict:
    cible = [p for p in _propositions_de(db, org_id, ids) if p.statut == "proposee"]
    maintenant = datetime.utcnow()
    for p in cible:
        p.statut, p.decidee_le = "ecartee", maintenant
    db.commit()
    return {"ecartees": len(cible)}


def a_valider(db: Session, org_id: str, rubrique: Optional[str] = None) -> list[dict]:
    from services.depot_cases import case_par_id
    q = db.query(PropositionProfil).filter(
        PropositionProfil.organization_id == org_id, PropositionProfil.statut == "proposee")
    if rubrique:
        q = q.filter(PropositionProfil.rubrique == rubrique)
    sortie = []
    for p in q.order_by(PropositionProfil.created_at, PropositionProfil.champ, PropositionProfil.id).all():
        case = case_par_id(p.case_depot)
        sortie.append({
            "id": p.id, "lecture_id": p.lecture_id, "document_id": p.document_id,
            "case": p.case_depot, "case_nom": case.nom if case else p.case_depot, "rubrique": p.rubrique,
            "champ": p.champ, "libelle": p.libelle, "affichage": p.affichage, "valeur": json.loads(p.valeur),
            "a_confirmer": p.remplace is not None, "remplace": p.remplace,
            "source": {"fichier": p.source_fichier, "page": p.source_page, "lieu": p.source_lieu},
            "extrait": p.extrait,
        })
    return sortie
