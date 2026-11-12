"""B9 — « Avant de déposer » : contrôle des fichiers du dossier, sans IA, sans rien écrire.

``GET /api/projects/{id}/export/controle-fichiers`` lit le MÊME plan que le ZIP (``routers.export._plan_du_zip`` :
mêmes chemins, mêmes noms) et rend les lignes « À relire » de ``services.controle_fichiers_zip`` : passages
« [À COMPLÉTER » restants (formulaires remplis lus sur disque ; mémoire compté sur son contenu, règle de l'export),
noms et chemins qui cassent sur certaines plateformes, taille comparée à la limite du règlement SI l'analyse l'a
relevée. Jamais bloquant. Isolement multi-tenant : projet lu avec ``org_id`` (404 sinon), pièces du coffre filtrées
par organisation, comme le ZIP."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session, defer

from database import get_db
from models.checklist_item import ChecklistItem
from models.document import Document
from models.memoire import MemoireTechnique
from models.project import ProjectDocument
from models.user import User
from routers.auth import get_auth_user
from services.controle_fichiers_zip import (
    FichierAControler, controler_fichiers, ligne_memoire, limite_de_taille,
)
from services.exigences import exigences_pour_memoire
from services.project_access import get_owned_project
from services.rate_limit import limiter

router = APIRouter()

# Fichiers dont le texte est cherché : ceux que l'entreprise a remplis (formulaires, DPGF). Les pièces du coffre
# (attestations, souvent des scans) ne portent jamais un « [À COMPLÉTER » de Synorix.
_GENRES_LUS = ("complete", "dpgf_remplie")


def _lecteur(chemin):
    return lambda: chemin.read_bytes()


@router.get("/{project_id}/export/controle-fichiers")
@limiter.limit("20/minute")
def controle_des_fichiers(
    request: Request,
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    from routers.export import _plan_du_zip
    from services.docx_exporter import compter_passages_a_completer
    from services.raison_sociale import nom_entreprise_effectif

    project = get_owned_project(project_id, user.organization_id, db)
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project.id).first()
    project_docs = (db.query(ProjectDocument).options(defer(ProjectDocument.extracted_text))
                    .filter(ProjectDocument.project_id == project.id).all())
    checklist_items = db.query(ChecklistItem).filter(ChecklistItem.project_id == project.id).all()
    lies = {i.linked_document_id for i in checklist_items if i.linked_document_id}
    docs_par_id = {d.id: d for d in db.query(Document).filter(
        Document.id.in_(lies), Document.organization_id == user.organization_id,
        Document.deleted_at.is_(None)).all()} if lies else {}
    plan = _plan_du_zip(db, project, user.organization_id, checklist_items=checklist_items,
                        project_docs=project_docs, memoire=memoire, docs_par_id=docs_par_id)

    exigences = [{"texte": e.exigence_text, "source": {"type": "exigence", "id": e.id,
                                                       "document": e.source_document, "page": e.source_page}}
                 for e in exigences_pour_memoire(db, project)]
    limite = limite_de_taille(exigences)

    fichiers: list[FichierAControler] = []
    passages_memoire = 0
    chemin_memoire = None
    for entree in plan.entrees:
        chemin_zip = f"{plan.racine}/{entree.dossier}/{entree.nom}"
        if entree.genre == "memoire":
            chemin_memoire = chemin_zip
            passages_memoire = compter_passages_a_completer(
                memoire.content_json if memoire else None,
                raison_sociale_vide=not nom_entreprise_effectif(plan.org, db))
            fichiers.append(FichierAControler(chemin_zip))       # taille connue seulement à l'export
            continue
        try:
            taille = entree.chemin.stat().st_size
        except OSError:
            taille = None
        lire = _lecteur(entree.chemin) if entree.genre in _GENRES_LUS else None
        fichiers.append(FichierAControler(chemin_zip, taille, lire))

    lignes = controler_fichiers(fichiers, limite)
    if chemin_memoire:
        ligne = ligne_memoire(chemin_memoire, passages_memoire)
        if ligne:
            lignes.insert(0, ligne)
    return {
        "lignes": lignes,
        "nombre": len(lignes),
        "fichiers": len(plan.entrees),
        "limite_taille": limite,
    }
