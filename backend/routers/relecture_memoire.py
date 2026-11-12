"""« Relire mon mémoire » (phase F) : contrôle déterministe, sans IA, du mémoire rédigé d'un projet.

Lecture seule : la route ne modifie rien et n'appelle jamais le modèle (le service ``relecture_memoire`` est pur).
Isolement multi-tenant : le projet est lu avec ``org_id`` (404 sinon), toutes les lectures filtrent sur ce projet."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, defer

from database import get_db
from models.checklist_item import ChecklistItem
from models.memoire import MemoireTechnique
from models.organization import Organization
from models.project import ProjectDocument
from models.user import User
from routers.auth import get_auth_user
from services.ai.dtu_autorises import regle_dtu
from services.exigences import exigences_pour_memoire
from services.project_access import get_owned_project
from services.raison_sociale import nom_entreprise_effectif
from services.rate_limit import limiter
from services.relecture_memoire import relire_memoire

router = APIRouter()


def _source_exigence(item) -> dict | None:
    """Source d'une ligne de checklist ou d'une exigence : l'exigence d'origine (le panneau « Voir dans le dossier »
    s'y ancre), sinon le document et la page cités."""
    exigence_id = getattr(item, "source_exigence_id", None)
    if exigence_id:
        return {"type": "exigence", "id": exigence_id}
    if item.source_document:
        return {"type": "champ", "document": item.source_document, "page": item.source_page,
                "excerpt": getattr(item, "source_in_rc", None)}
    return None


def _source_criteres(project) -> dict | None:
    """La source des critères (page du RC qui porte le jugement des offres), lue dans les champs critiques
    déjà calculés du lot : le même passage que la carte « L'AO en 30 secondes »."""
    champs = (project.critical_fields or {}).get(project.selected_lot or "_all")
    if not isinstance(champs, dict):
        return None
    source = (champs.get("criteres") or {}).get("source")
    if not isinstance(source, dict) or not source.get("document"):
        return None
    return {"type": "champ", "document": source["document"], "page": source.get("page"),
            "excerpt": source.get("excerpt")}


@router.get("/{project_id}/memoire/relecture")
@limiter.limit("30/minute")
def relire_mon_memoire(
    request: Request,
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, user.organization_id, db)
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project.id).first()
    if memoire is None or not isinstance(memoire.content_json, dict):
        raise HTTPException(status_code=404, detail="Aucun mémoire à relire pour ce dossier.")

    docs = (db.query(ProjectDocument).filter(ProjectDocument.project_id == project.id).all())
    ids_lots = [l.get("id") for l in (project.lots_detectes or []) if l.get("id")]
    regle = regle_dtu(docs, project.selected_lot, project.selected_lot_name, project.lots_detectes or [], ids_lots)

    pieces = [
        {"type": i.document_type_required, "source": _source_exigence(i)}
        for i in db.query(ChecklistItem).filter(ChecklistItem.project_id == project.id)
        .order_by(ChecklistItem.rc_position, ChecklistItem.id).all()
        if not i.lot or i.lot == project.selected_lot or not project.selected_lot
    ]
    lues = exigences_pour_memoire(db, project)
    exigences = [
        {"texte": e.exigence_text, "source": {"type": "exigence", "id": e.id}}
        for e in lues
    ]
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    relecture = relire_memoire(
        memoire.content_json,
        criteres=project.criteres_jugement,
        source_criteres=_source_criteres(project),
        pieces=pieces,
        dtu_autorises=regle.numeros(),
        exigences=exigences,
        raison_sociale_vide=not nom_entreprise_effectif(org, db),
    )
    corps = relecture.en_dict()
    corps["exigences"] = _exigences_reliees(memoire.content_json, lues, docs)   # B4
    return corps


def _exigences_reliees(contenu, lues, docs) -> dict:
    """B4 — les exigences de contenu technique du RÈGLEMENT (document source de type « rc » ; tous les documents si
    aucun RC n'est typé), dans l'ordre de ses pages, reliées au paragraphe du mémoire qui les traite."""
    from services.exigences_memoire import relier_exigences, resume

    noms_rc = {d.file_name for d in docs if (d.type or "") == "rc"}
    du_rc = [e for e in lues if e.source_document and (not noms_rc or e.source_document in noms_rc)]
    du_rc.sort(key=lambda e: e.source_page if e.source_page is not None else 10_000)
    exigences = [{"id": e.id, "texte": e.exigence_text, "categorie": e.category,
                  "source": {"type": "exigence", "id": e.id, "document": e.source_document, "page": e.source_page}}
                 for e in du_rc]
    return resume(relier_exigences(contenu, exigences))
