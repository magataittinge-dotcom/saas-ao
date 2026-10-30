from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime


class ExportSummary(BaseModel):
    # Export « 0/N » (décision du 25/10) : exigences relevées, avec leur extrait
    # retrouvé, confirmées par l'utilisateur — jamais « couvertes ».
    compliance_total: int
    compliance_confirmed: int
    compliance_with_source: int
    checklist_total: int
    checklist_present: int
    has_memoire: bool
    has_dpgf: bool


class ComplianceExportItem(BaseModel):
    id: str
    exigence_text: str
    category: str
    priority: str
    status: str   # « couvert » = confirmée par l'utilisateur (STATUT_CONFIRMEE)
    groupe: str   # candidature | offre_technique | execution (services/exigences)
    source_document: Optional[str] = None
    source_page: Optional[int] = None
    source_verifiee: bool = False   # extrait retrouvé mot pour mot dans le DCE

    model_config = {"from_attributes": True}


class ChecklistExportItem(BaseModel):
    id: str
    document_type_required: str
    status: str
    details: Optional[str] = None
    linked_document_name: Optional[str] = None
    linked_document_id: Optional[str] = None
    source_kind: str = "vault"
    signature_confirmed: bool = False  # C12 — pour le gate d'export
    # Signature demandée pour cette pièce (checklist_matcher.signature_requise)
    signature_required: bool = False
    # fournir | completer | synorix | workflow — le score ne compte que les deux premiers
    document_group: str = "fournir"
    # Décision du 25/10 (point 3) : « Jointe » est un FAIT — le fichier part dans
    # le ZIP, valable et daté (pièce du coffre) ; avec son nom et sa date de fin.
    jointe: bool = False
    piece_nom: Optional[str] = None
    valable_jusqu_au: Optional[date] = None
    # Statuts positifs (bloc 9) : lecture du RC, checklist_matcher.lire_obligation / lire_phase
    obligation: str = "obligatoire"   # obligatoire | si_concerne | facultatif
    phase: str = "depot"              # depot | attribution

    model_config = {"from_attributes": True}


class PieceZipExport(BaseModel):
    """Une pièce du ZIP, telle qu'elle y part (même plan que l'archive)."""
    dossier: str          # 01_Candidature | 02_Offre | 3_ANNEXES
    nom: str
    genre: str            # coffre | complete | memoire | dpgf_remplie | annexe
    document_projet_id: Optional[str] = None   # formulaire rempli : aperçu possible


class ProjectDocumentExportItem(BaseModel):
    id: str
    file_name: str
    type: str
    pdf_preview_url: Optional[str] = None

    model_config = {"from_attributes": True}


class MemoireExportInfo(BaseModel):
    version: int
    generated_at: datetime
    sections_count: int
    estimated_pages: int
    # Passages « [À COMPLÉTER : … ] » restant dans le texte : l'écran dit « N passages à compléter ».
    passages_a_completer: int = 0


class DpgfExportInfo(BaseModel):
    file_name: str
    file_id: str


class DpgfRemplieInfo(BaseModel):
    file_name: Optional[str] = None
    verification: Optional[dict] = None


class ExportDetail(BaseModel):
    # Summary counts — voir ExportSummary
    compliance_total: int
    compliance_confirmed: int
    compliance_with_source: int
    checklist_total: int
    checklist_present: int
    has_memoire: bool
    has_dpgf: bool

    # Detailed items
    compliance_items: list[ComplianceExportItem]
    checklist_items: list[ChecklistExportItem]
    project_documents: list[ProjectDocumentExportItem] = []
    pieces_zip: list[PieceZipExport] = []   # exactement ce que le ZIP contient
    memoire_info: Optional[MemoireExportInfo] = None
    dpgf_info: Optional[DpgfExportInfo] = None
    dpgf_remplie: Optional[DpgfRemplieInfo] = None
    # C13b — convention de nommage détectée dans le RC (template), sinon None
    naming_convention: Optional[str] = None
