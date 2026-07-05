import logging
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

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

    model_config = {"from_attributes": True}


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
