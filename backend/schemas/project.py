from pydantic import BaseModel, Field, computed_field, field_validator, ValidationInfo
from typing import Literal, Optional, List, Any
from datetime import date, datetime


# S-17 — longueurs alignées sur les colonnes (projects.name String(500), maitre_ouvrage String(255)) : 422, jamais 500.
class ProjectCreate(BaseModel):
    name: str = Field(max_length=500)
    maitre_ouvrage: Optional[str] = Field(default=None, max_length=255)
    deadline: Optional[date] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=500)
    status: Optional[Literal[
        "brouillon", "en_cours", "analyzed", "sans_suite", "soumis", "gagné", "perdu",
    ]] = None
    maitre_ouvrage: Optional[str] = Field(default=None, max_length=255)
    deadline: Optional[date] = None
    current_step: Optional[int] = None


class UnitesAO(BaseModel):
    """Unités du forfait consommées par cet AO (1 analyse = 1 unité ; 1 mémoire par lot = 1 unité)."""
    analyses: int = 0
    memoires: int = 0


class PiecesAO(BaseModel):
    """Pièces du coffre-fort demandées par l'AO (hors « non applicable ») et celles qui sont prêtes."""
    total: int
    pretes: int


class AvancementAO(BaseModel):
    """Ce que Mes AO affiche en plus de l'étape : calculé en lot par services/avancement_ao.py, null quand la donnée n'existe pas."""
    unites: UnitesAO
    pieces: Optional[PiecesAO] = None
    plan_valide_le: Optional[datetime] = None
    memoire_ecrit_le: Optional[datetime] = None


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
    depose_at: Optional[datetime] = None
    # Rempli par la seule liste (GET /projects) ; null ailleurs.
    avancement: Optional[AvancementAO] = None
    # Lu sur le modèle pour calculer l'échéance, jamais renvoyé tel quel.
    critical_fields: Optional[Any] = Field(default=None, exclude=True)

    model_config = {"from_attributes": True}

    @field_validator("infos_marche", mode="after")
    @classmethod
    def _points_filtres_a_la_lecture(cls, infos, info: ValidationInfo):
        """« Points à éclaircir » enregistrés : les filtres déterministes (extrait tronqué, fait déjà lu, prix) s'appliquent aussi à la
        LECTURE, pour les questions enregistrées avant eux. La base n'est jamais réécrite."""
        from services import points_eclaircir as pe
        if not isinstance(infos, dict) or not isinstance(infos.get(pe.CLE_INFOS), list):
            return infos
        faits = pe.faits_connus(info.data.get("criteres_jugement"), infos)
        return {**infos, pe.CLE_INFOS: pe.normaliser(infos[pe.CLE_INFOS], faits=faits)}

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
