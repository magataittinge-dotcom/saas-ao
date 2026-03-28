from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import date, datetime


class ProjectCreate(BaseModel):
    name: str
    maitre_ouvrage: Optional[str] = None
    deadline: Optional[date] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    maitre_ouvrage: Optional[str] = None
    deadline: Optional[date] = None
    current_step: Optional[int] = None


class ProjectResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    status: str
    deadline: Optional[date]
    maitre_ouvrage: Optional[str]
    current_step: int
    completed_steps: Optional[dict] = None
    criteres_jugement: Optional[List[Any]] = None
    infos_marche: Optional[Any] = None
    lots_detectes: Optional[List[Any]] = None
    selected_lot: Optional[str] = None
    selected_lot_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectDocumentUpdate(BaseModel):
    type: str
