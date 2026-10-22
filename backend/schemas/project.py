from pydantic import BaseModel, Field, computed_field
from typing import Literal, Optional, List, Any
from datetime import date, datetime


class ProjectCreate(BaseModel):
    name: str
    maitre_ouvrage: Optional[str] = None
    deadline: Optional[date] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[Literal[
        "brouillon", "en_cours", "analyzed", "sans_suite", "soumis", "gagné", "perdu",
    ]] = None
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
    processing_status: Optional[str] = None
    processing_progress: Optional[int] = 0
    processing_detail: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Lu sur le modèle pour calculer l'échéance, jamais renvoyé tel quel.
    critical_fields: Optional[Any] = Field(default=None, exclude=True)

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def echeance(self) -> Optional[dict]:
        """1.14 — L'échéance unique de l'AO, la même pour tous les écrans :
        la date saisie si elle existe (avec l'heure du RC quand le RC donne le
        même jour), sinon la date et l'heure lues dans le RC (champs critiques
        du lot courant), sinon la date relevée par l'analyse."""
        rc = None
        cache = self.critical_fields if isinstance(self.critical_fields, dict) else {}
        lot = cache.get(self.selected_lot or "_all")
        if isinstance(lot, dict):
            valeur = (lot.get("date_limite_remise") or {}).get("value")
            if isinstance(valeur, dict) and valeur.get("date"):
                rc = {"date": str(valeur["date"])[:10], "heure": valeur.get("heure") or None}
        if self.deadline:
            jour = self.deadline.isoformat()
            return {"date": jour, "heure": rc["heure"] if rc and rc["date"] == jour else None}
        if rc:
            return rc
        infos = self.infos_marche if isinstance(self.infos_marche, dict) else {}
        brut = str(infos.get("date_limite_reponse") or "")
        if len(brut) >= 10 and brut[4] == "-" and brut[7] == "-":
            return {"date": brut[:10], "heure": None}
        return None


class ProjectDocumentUpdate(BaseModel):
    type: str
