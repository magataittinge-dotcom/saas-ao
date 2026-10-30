import logging
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, computed_field, field_serializer, model_validator

logger = logging.getLogger(__name__)


class ComplianceItemResponse(BaseModel):
    id: str
    project_id: str
    exigence_text: str
    source_document: Optional[str]
    source_page: Optional[int]
    source_excerpt: Optional[str]
    status: str
    category: str
    priority: str
    suggestion_ia: Optional[str]
    lot: Optional[str] = None   # '_commun' | 'lotN' | None (legacy)
    created_at: datetime

    model_config = {"from_attributes": True}


class ChecklistItemResponse(BaseModel):
    id: str
    project_id: str
    document_type_required: str
    source_kind: str = "vault"
    linked_document_id: Optional[str] = None
    template_project_doc_id: Optional[str] = None
    completed_project_doc_id: Optional[str] = None
    status: str
    details: Optional[str]
    source_in_rc: Optional[str]
    signature_confirmed: bool = False
    lot: Optional[str] = None   # NULL = pièce commune ; 'lotN' = pièce du lot
    document_group: str = "fournir"  # fournir | completer | synorix | workflow
    # « Jointe » : FAIT vérifié sur le plan du ZIP (routers/export._etat_piece),
    # renseigné par GET /checklist — le fichier part dans le dossier, valable et
    # daté pour une pièce du coffre ; avec son nom et sa date de fin.
    jointe: bool = False
    piece_nom: Optional[str] = None
    valable_jusqu_au: Optional[date] = None
    # « Déposé le … par … » : instant UTC (sérialisé avec « Z ») et nom de l'auteur.
    depose_le: Optional[datetime] = None
    depose_par: Optional[str] = None
    # D'où la ligne a été lue dans le RC : document, page, article, exigence d'origine.
    source_document: Optional[str] = None
    source_page: Optional[int] = None
    source_article: Optional[str] = None
    source_exigence_id: Optional[str] = None

    model_config = {"from_attributes": True}

    @field_serializer("depose_le")
    def _depose_le_utc(self, v: Optional[datetime]) -> Optional[str]:
        # colonne naïve = UTC ; le « Z » laisse l'écran dater dans le fuseau de Paris
        return None if v is None else v.replace(tzinfo=None).isoformat() + "Z"

    @computed_field
    @property
    def obligation(self) -> str:
        """« obligatoire » | « si_concerne » | « facultatif » (lecture du RC,
        checklist_matcher.lire_obligation)."""
        from services.ai.checklist_matcher import lire_obligation
        return lire_obligation(self)

    @computed_field
    @property
    def phase(self) -> str:
        """« depot » | « attribution » (checklist_matcher.lire_phase)."""
        from services.ai.checklist_matcher import lire_phase
        return lire_phase(self)

    @computed_field
    @property
    def signature_required(self) -> bool:
        """« Je confirme avoir signé » demandé pour cette pièce ? Règle unique
        côté serveur (checklist_matcher.signature_requise) : DC1, DC2, DUME et
        AE seulement si l'extrait du RC l'exige."""
        from services.ai.checklist_matcher import signature_requise
        return signature_requise(self)


SourceKind = Literal["vault", "dce_template"]
ExpectedTemplateType = Literal[
    "dc1_template",
    "dc2_template",
    "acte_engagement_template",
    "dpgf_template",
    "bpu_template",
    "dqe_template",
    "cadre_reponse",
    "attestation_visite_template",
]
RequirementCategory = Literal[
    "candidature", "offre", "technique", "planning", "criteres_notation"
]
RequirementPriority = Literal["obligatoire", "souhaitée"]


class RequirementFromAI(BaseModel):
    """A single requirement extracted by the IA from a DCE document.

    Validates the new ``source_kind`` and ``expected_template_type`` fields,
    falling back to safe defaults (``vault`` / ``None``) when the model
    returns a value outside the allowed set."""

    exigence: str
    source_document: Optional[str] = None
    source_page: Optional[int] = None
    source_excerpt: Optional[str] = None
    category: RequirementCategory
    priority: RequirementPriority = "obligatoire"
    source_kind: SourceKind = "vault"
    expected_template_type: Optional[ExpectedTemplateType] = None

    model_config = {
        # Tolerate extra keys if the AI sends them — we just ignore them.
        "extra": "ignore",
    }

    @model_validator(mode="after")
    def _coherence_check(self) -> "RequirementFromAI":
        # Mismatch warnings — don't fail, just log so we can spot bad outputs.
        if self.source_kind == "dce_template" and self.expected_template_type is None:
            logger.warning(
                "RequirementFromAI: source_kind='dce_template' but expected_template_type is null "
                "(exigence: %r) — keeping dce_template, downstream matcher will warn",
                self.exigence[:80],
            )
        elif self.source_kind == "vault" and self.expected_template_type is not None:
            logger.warning(
                "RequirementFromAI: source_kind='vault' but expected_template_type=%r "
                "(exigence: %r) — clearing expected_template_type",
                self.expected_template_type,
                self.exigence[:80],
            )
            object.__setattr__(self, "expected_template_type", None)
        return self
