from pydantic import BaseModel, EmailStr
from typing import Optional


class SyncRequest(BaseModel):
    """Onboarding post-inscription. `plan` est VOLONTAIREMENT absent :
    `org.plan` n'est écrit QUE par les webhooks Stripe (sinon self-upgrade
    gratuit). Un champ `plan` envoyé ici est ignoré silencieusement."""
    organization_name: Optional[str] = None
    siret: Optional[str] = None
    # G7 — le SIRET est saisi depuis « Mon entreprise » (profil déjà ouvert) et non à l'inscription : mêmes contrôles,
    # phrases adaptées, et un SIRET déjà pris n'enlève pas l'essai d'un compte existant.
    depuis_profil: bool = False
