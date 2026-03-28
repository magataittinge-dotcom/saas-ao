from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.project import Project, ProjectDocument
from models.memoire import MemoireTechnique
from models.compliance_item import ComplianceItem
from models.organization import Organization
from models.team_member import TeamMember
from models.reference import Reference
from models.memoire_config import MemoireConfig
from schemas.memoire import MemoireGenerateRequest, MemoireUpdateRequest, MemoireResponse
from routers.auth import get_auth_user
from services.ai.memoire_generator import MemoireGenerator

router = APIRouter()


@router.get("/{project_id}/memoire", response_model=MemoireResponse)
def get_memoire(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, user.organization_id, db)
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    if not memoire:
        raise HTTPException(status_code=404, detail="Mémoire non généré")
    return memoire


@router.post("/{project_id}/memoire/generate", response_model=MemoireResponse)
async def generate_memoire(
    project_id: str,
    payload: MemoireGenerateRequest,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, user.organization_id, db)

    # Fetch all context needed
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    memoire_cfg = db.query(MemoireConfig).filter(MemoireConfig.organization_id == user.organization_id).first()
    docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()
    refs = db.query(Reference).filter(
        Reference.organization_id == user.organization_id,
        Reference.is_reference == True,
    ).all()
    compliance_items = (
        db.query(ComplianceItem)
        .filter(ComplianceItem.project_id == project_id)
        .order_by(ComplianceItem.category)
        .all()
    )

    if not docs:
        raise HTTPException(status_code=400, detail="Aucun document DCE uploadé")

    variables = payload.model_dump(exclude_none=True)

    # Call Opus synchronously (awaited — can take 2-3 min, uses streaming)
    generator = MemoireGenerator()
    try:
        content = await generator.generate(
            organization=org,
            memoire_config=memoire_cfg,
            project_name=project.name,
            maitre_ouvrage=project.maitre_ouvrage or "",
            all_docs=docs,
            compliance_items=compliance_items,
            references=refs,
            variables=variables,
            criteres_jugement=project.criteres_jugement or [],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération : {str(e)}")

    # Upsert mémoire
    existing = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    if existing:
        existing.content_json = content
        existing.version += 1
        existing.variables = variables
        existing.generated_at = datetime.utcnow()
        memoire = existing
    else:
        memoire = MemoireTechnique(
            project_id=project_id,
            content_json=content,
            variables=variables,
        )
        db.add(memoire)

    # Advance project to step 4
    if project.current_step < 4:
        project.current_step = 4
        project.status = "en_cours"

    db.commit()
    db.refresh(memoire)
    return memoire


@router.patch("/{project_id}/memoire", response_model=MemoireResponse)
def update_memoire(
    project_id: str,
    payload: MemoireUpdateRequest,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, user.organization_id, db)
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    if not memoire:
        raise HTTPException(status_code=404, detail="Mémoire introuvable")
    memoire.content_json = payload.content_json
    db.commit()
    db.refresh(memoire)
    return memoire


def _get_project_or_404(project_id: str, org_id: str, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.organization_id == org_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return project
