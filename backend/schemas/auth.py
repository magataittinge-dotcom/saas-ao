from pydantic import BaseModel, EmailStr
from typing import Optional


class SyncRequest(BaseModel):
    organization_name: Optional[str] = None
    siret: Optional[str] = None
    plan: str = "free"
