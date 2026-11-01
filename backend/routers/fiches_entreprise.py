"""Fiches « Mon entreprise » à télécharger — /api/entreprise/fiches/{rubrique}.

Trois rubriques (identité, moyens, certifications). Chaque fiche a un aperçu (données relues à chaque appel,
jamais copiées) et un bordereau modifiable : titre, sous-titre, contact, couleur d'accent, lignes libres,
logo. Toutes les routes travaillent sur l'entreprise de l'utilisateur authentifié (``organization_id`` posé
par le serveur, jamais lu du corps ni de l'adresse) : aucune fiche d'une autre entreprise n'est atteignable.
"""
import asyncio
import io
import re
import unicodedata
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from sqlalchemy.orm import Session

from database import get_db, rendre_connexion
from models.fiche_entreprise import FicheEntreprise
from models.organization import Organization
from models.user import User
from routers.auth import get_auth_user
from schemas.fiches_entreprise import (
    COULEUR_PAR_DEFAUT, RUBRIQUES, SECTIONS, BordereauIn,
)
from services import fiches_donnees as donnees_fiche
from services import fiches_entreprise as generation
from services import fiches_logo
from services.file_storage import FileStorage, sign_file_path
from services.rate_limit import limiter
from services.upload_validation import RegleDepot, recevoir_fichier

router = APIRouter()

# Logo : PNG ou JPEG, 2 Mo au plus. Le contenu réel est ensuite jugé par Pillow (services/fiches_logo.py).
_REGLE_LOGO = RegleDepot(frozenset({".png", ".jpg", ".jpeg"}), fiches_logo.MAX_OCTETS, "PNG ou JPEG")


def _rubrique_ou_404(rubrique: str) -> str:
    if rubrique not in RUBRIQUES:
        raise HTTPException(status_code=404, detail="Fiche introuvable")
    return rubrique


def _org_ou_404(db: Session, user: User) -> Organization:
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if org is None:
        raise HTTPException(status_code=404, detail="Organisation introuvable")
    return org


def _fiche(db: Session, org_id: str, rubrique: str) -> Optional[FicheEntreprise]:
    return db.query(FicheEntreprise).filter(
        FicheEntreprise.organization_id == org_id, FicheEntreprise.rubrique == rubrique,
    ).first()


def valeurs_par_defaut(org: Organization, rubrique: str) -> dict:
    return {
        "titre": donnees_fiche.TITRES[rubrique],
        "sous_titre": f"Dossier entreprise · {donnees_fiche.mois_annee(donnees_fiche.aujourdhui())}",
        "contact": donnees_fiche.contact_par_defaut(org),
        "couleur": COULEUR_PAR_DEFAUT,
    }


def bordereau_effectif(org: Organization, fiche: Optional[FicheEntreprise], rubrique: str) -> dict:
    """Le bordereau tel qu'il s'imprime : valeur enregistrée, sinon valeur par défaut de la rubrique."""
    defauts = valeurs_par_defaut(org, rubrique)
    lignes = (fiche.lignes_libres if fiche is not None else None) or []
    return {
        "titre": (fiche.titre if fiche else None) or defauts["titre"],
        "sous_titre": (fiche.sous_titre if fiche else None) or defauts["sous_titre"],
        "contact": (fiche.contact if fiche else None) or defauts["contact"],
        "couleur": (fiche.couleur if fiche else None) or defauts["couleur"],
        "lignes_libres": [l for l in lignes if isinstance(l, dict) and l.get("section") in SECTIONS[rubrique]],
    }


def logo_de_la_fiche(org: Organization, fiche: Optional[FicheEntreprise]) -> tuple[Optional[str], Optional[str]]:
    """(url « /uploads/… », origine) du logo imprimé : celui de la fiche, sinon le logo de l'entreprise."""
    if fiche is not None and fiches_logo.existe(fiche.logo_path):
        return fiche.logo_path, "fiche"
    if fiches_logo.existe(org.logo_url):
        return org.logo_url, "entreprise"
    return None, None


def _url_signee(org_id: str, url: Optional[str]) -> Optional[str]:
    """URL signée à durée limitée (15 min), liée à l'entreprise : jamais le chemin disque."""
    rel = fiches_logo.chemin_relatif(url)
    return sign_file_path(rel, org_id=org_id) if rel else None


def _reponse(db: Session, org: Organization, rubrique: str) -> dict:
    fiche = _fiche(db, org.id, rubrique)
    bordereau = bordereau_effectif(org, fiche, rubrique)
    logo, origine = logo_de_la_fiche(org, fiche)
    return {
        "rubrique": rubrique,
        "libelle": donnees_fiche.LIBELLES_RUBRIQUE[rubrique],
        "bordereau": {**bordereau, "enregistre": fiche is not None, "logo_url": _url_signee(org.id, logo),
                      "logo_origine": origine},
        "valeurs_par_defaut": valeurs_par_defaut(org, rubrique),
        "sections_libres": list(SECTIONS[rubrique]),
        "palette": donnees_fiche.palette(bordereau["couleur"]),
        "donnees": donnees_fiche.assembler(db, org.id, rubrique),
    }


@router.get("/{rubrique}")
def lire_fiche(
    rubrique: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Données assemblées de la rubrique + bordereau (enregistré, sinon valeurs par défaut)."""
    _rubrique_ou_404(rubrique)
    return _reponse(db, _org_ou_404(db, user), rubrique)


@router.put("/{rubrique}")
def enregistrer_bordereau(
    rubrique: str,
    payload: BordereauIn,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Enregistre le bordereau de la rubrique. Un champ vide revient à la valeur par défaut."""
    _rubrique_ou_404(rubrique)
    org = _org_ou_404(db, user)
    autorisees = SECTIONS[rubrique]
    for ligne in payload.lignes_libres:
        if ligne.section not in autorisees:
            raise HTTPException(
                status_code=422,
                detail=f"Section « {ligne.section} » inconnue pour cette fiche (sections : {', '.join(autorisees)}).",
            )
    fiche = _fiche(db, org.id, rubrique)
    if fiche is None:
        fiche = FicheEntreprise(organization_id=org.id, rubrique=rubrique)
        db.add(fiche)
    fiche.titre = payload.titre
    fiche.sous_titre = payload.sous_titre
    fiche.contact = payload.contact
    fiche.couleur = payload.couleur
    fiche.lignes_libres = [l.model_dump() for l in payload.lignes_libres]
    db.commit()
    return _reponse(db, org, rubrique)


@router.post("/{rubrique}/logo")
@limiter.limit("10/minute")
async def deposer_logo(
    request: Request,
    rubrique: str,
    file: UploadFile = File(...),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Logo de la fiche : PNG ou JPEG de 2 Mo au plus, vérifié par son contenu, recréé en WebP (512 px
    au plus, métadonnées perdues), rangé sous un nom aléatoire hors webroot, servi par URL signée."""
    _rubrique_ou_404(rubrique)
    org = _org_ou_404(db, user)
    with await recevoir_fichier(request, file, _REGLE_LOGO) as recu:
        octets = await recu.octets()
    try:
        webp = await asyncio.to_thread(fiches_logo.reencoder_en_webp, octets)
    except fiches_logo.LogoRefuse as exc:
        raise HTTPException(status_code=415, detail=str(exc))
    url = await FileStorage().upload_stream(
        io.BytesIO(webp), "logo.webp", f"organizations/{org.id}/fiches", "image/webp",
    )
    fiche = _fiche(db, org.id, rubrique)
    ancien = fiche.logo_path if fiche is not None else None
    if fiche is None:
        fiche = FicheEntreprise(organization_id=org.id, rubrique=rubrique)
        db.add(fiche)
    fiche.logo_path = url
    db.commit()
    if ancien and ancien != url:
        fiches_logo.supprimer_local(ancien)
    return {"logo_url": _url_signee(org.id, url), "logo_origine": "fiche"}


@router.delete("/{rubrique}/logo")
def retirer_logo(
    rubrique: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Retire le logo propre à la fiche : l'aperçu reprend le logo de l'entreprise, s'il y en a un."""
    _rubrique_ou_404(rubrique)
    org = _org_ou_404(db, user)
    fiche = _fiche(db, org.id, rubrique)
    if fiche is not None and fiche.logo_path:
        ancien, fiche.logo_path = fiche.logo_path, None
        db.commit()
        fiches_logo.supprimer_local(ancien)
    logo, origine = logo_de_la_fiche(org, fiche)
    return {"logo_url": _url_signee(org.id, logo), "logo_origine": origine}


def _nom_de_fichier(rubrique: str, societe: str, extension: str) -> str:
    nu = unicodedata.normalize("NFKD", societe or "").encode("ascii", "ignore").decode("ascii")
    nu = re.sub(r"[^A-Za-z0-9]+", "_", nu).strip("_")[:40]
    return f"{donnees_fiche.NOMS_FICHIER[rubrique]}{'_' + nu if nu else ''}.{extension}"


@router.post("/{rubrique}/generer")
@limiter.limit("10/minute")
def generer_fiche(
    request: Request,
    rubrique: str,
    format_: str = Query("pdf", alias="format", pattern="^(pdf|docx)$"),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Word ou PDF de la fiche, produit sur le serveur à partir des données et du bordereau ENREGISTRÉS de
    l'entreprise de l'utilisateur (même mise en page que l'aperçu). Le fichier est renvoyé dans la réponse :
    il n'est ni stocké ni accessible par une adresse."""
    _rubrique_ou_404(rubrique)
    org = _org_ou_404(db, user)
    if format_ == "pdf" and not generation.soffice_available():
        raise HTTPException(
            status_code=503,
            detail="Le PDF est indisponible sur ce serveur pour le moment — téléchargez la version Word.",
        )
    fiche = _fiche(db, org.id, rubrique)
    bordereau = bordereau_effectif(org, fiche, rubrique)
    donnees = donnees_fiche.assembler(db, org.id, rubrique)
    logo, _origine = logo_de_la_fiche(org, fiche)
    logo_png = fiches_logo.en_png(fiches_logo.lire_local(logo)) if logo else None
    rendre_connexion(db)       # plus de base ensuite : la conversion PDF peut durer
    docx = generation.generer_docx(donnees, bordereau, donnees_fiche.palette(bordereau["couleur"]), logo_png)
    if format_ == "docx":
        contenu, type_ = docx, generation.TYPE_DOCX
    else:
        try:
            contenu, type_ = generation.generer_pdf(docx), generation.TYPE_PDF
        except generation.PdfConversionError as exc:
            raise HTTPException(status_code=503, detail=str(exc),
                                headers={"Retry-After": str(exc.retry_apres_s)})
    nom = _nom_de_fichier(rubrique, donnees["societe"]["nom"], format_)
    return Response(
        content=contenu, media_type=type_,
        headers={"Content-Disposition": f"attachment; filename=\"{nom}\"; filename*=UTF-8''{quote(nom, safe='')}",
                 "Cache-Control": "private, no-store"},
    )
