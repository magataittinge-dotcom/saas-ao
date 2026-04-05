from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class MemoireGenerateRequest(BaseModel):
    nb_ouvriers: Optional[int] = None
    delai: Optional[str] = None
    interlocuteur_id: Optional[str] = None
    particularites: Optional[str] = None
    chef_chantier_nom: Optional[str] = None
    chef_chantier_qualification: Optional[str] = None
    conducteur_travaux_nom: Optional[str] = None
    conducteur_travaux_qualification: Optional[str] = None
    materiel_specifique: Optional[str] = None


class MemoireUpdateRequest(BaseModel):
    content_json: Any


class MemoireResponse(BaseModel):
    id: str
    project_id: str
    content_json: Any
    version: int
    generated_at: datetime
    variables: Optional[Any]
    is_reference_template: bool
    docx_export_url: Optional[str]

    model_config = {"from_attributes": True}
