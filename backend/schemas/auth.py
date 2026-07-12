from pydantic import BaseModel, EmailStr
from typing import Optional


class SyncRequest(BaseModel):
    """Onboarding post-inscription. `plan` est VOLONTAIREMENT absent :
    `org.plan` n'est écrit QUE par les webhooks Stripe (sinon self-upgrade
    gratuit). Un champ `plan` envoyé ici est ignoré silencieusement."""
    organization_name: Optional[str] = None
    siret: Optional[str] = None
