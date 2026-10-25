import asyncio
import io
import json
import logging
import os
import re
import tempfile
import unicodedata
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from pathlib import Path as FilePath
from urllib.parse import quote
import mimetypes
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
from services.rate_limit import limiter
from sqlalchemy.orm import Session, defer

from database import get_db
from models.user import User
from models.project import Project, ProjectDocument
from models.compliance_item import ComplianceItem, STATUT_CONFIRMEE
from models.checklist_item import ChecklistItem
from models.memoire import MemoireTechnique
from schemas.export import ExportSummary, ExportDetail, ComplianceExportItem, ChecklistExportItem, MemoireExportInfo, DpgfExportInfo, PieceZipExport, ProjectDocumentExportItem
from routers.auth import get_auth_user
from services.file_storage import FileStorage
from services.upload_validation import RegleDepot, recevoir_fichier
from services.dpgf_checker import check_dpgf
from services.pdf_export import PdfConversionError, docx_to_pdf, soffice_available

logger = logging.getLogger(__name__)

UPLOADS_ROOT = FilePath(__file__).parent.parent / "uploads"

router = APIRouter()


@router.get("/{project_id}/export/detail", response_model=ExportDetail)
def get_export_detail(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Detailed export data for the verification dashboard."""
    project = _get_project_or_404(project_id, user.organization_id, db)

    # Exigences du DOSSIER exporté (tronc commun + lot sélectionné), comme
    # l'écran Analyse — avant : celles de tous les lots du projet.
    from services.exigences import groupe_de_categorie, requete_exigences_du_dossier
    compliance_items = (
        requete_exigences_du_dossier(db, project)
        .order_by(ComplianceItem.category, ComplianceItem.created_at)
        .all()
    )
    checklist_items = (
        db.query(ChecklistItem)
        .filter(ChecklistItem.project_id == project_id)
        .all()
    )
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    # Textes extraits non lus (seul celui du RC sert, chargé à la demande plus bas).
    project_docs = (db.query(ProjectDocument)
                    .options(defer(ProjectDocument.extracted_text))
                    .filter(ProjectDocument.project_id == project_id).all())

    # Build checklist with linked doc names — une seule requête pour toutes les
    # pièces liées (avant : une par ligne de checklist).
    from models.document import Document
    from services.ai.checklist_matcher import signature_requise
    from services.checklist_builder import recaler_lignes_coffre
    lies = {i.linked_document_id for i in checklist_items if i.linked_document_id}
    docs_lies = {}
    if lies:
        # Filtre org (S2.3) : ne jamais exposer le nom d'un Document d'une
        # autre org via un linked_document_id périmé/forgé.
        docs_lies = {d.id: d for d in db.query(Document).filter(
            Document.id.in_(lies),
            Document.organization_id == user.organization_id,
            Document.deleted_at.is_(None),
        ).all()}
    # B1 — pièces du coffre jugées à la date du jour, comme dans le ZIP.
    # Recalage en mémoire ; écrit après la construction de la réponse (un
    # commit plus tôt rechargerait chaque ligne une par une).
    recalees = recaler_lignes_coffre(checklist_items, docs_lies)
    # Même plan que le ZIP : « Jointe » et la liste des pièces disent ce qui part.
    plan = _plan_du_zip(db, project, user.organization_id, checklist_items=checklist_items,
                        project_docs=project_docs, memoire=memoire, docs_par_id=docs_lies)
    docs_projet = {d.id: d for d in project_docs}
    checklist_export = []
    for item in checklist_items:
        doc = docs_lies.get(item.linked_document_id) if item.linked_document_id else None
        doc_name = doc.file_name if doc else None
        jointe, piece_nom, valable_jusqu_au = _etat_piece(item, docs_lies, docs_projet, plan)
        checklist_export.append(ChecklistExportItem(
            id=item.id,
            document_type_required=item.document_type_required,
            status=item.status,
            details=item.details,
            linked_document_name=doc_name,
            linked_document_id=item.linked_document_id,
            # le gate d'export du front lit ces trois champs (jamais remplis avant)
            source_kind=item.source_kind or "vault",
            signature_confirmed=bool(item.signature_confirmed),
            signature_required=signature_requise(item),
            # le gate d'export compte les mêmes lignes que le score serveur
            document_group=item.document_group or "fournir",
            jointe=jointe, piece_nom=piece_nom, valable_jusqu_au=valable_jusqu_au,
        ))

    # Mémoire info
    memoire_info = None
    if memoire:
        cj = memoire.content_json or {}
        sections = 1  # preambule
        for part_key in ("partie_a", "partie_b", "partie_c"):
            part = cj.get(part_key, {})
            if isinstance(part, dict):
                sections += sum(1 for v in part.values() if v)
        # Estimate ~1 page per 500 words
        total_text = str(cj)
        word_count = len(total_text.split())
        estimated_pages = max(1, word_count // 500)
        memoire_info = MemoireExportInfo(
            version=memoire.version,
            generated_at=memoire.generated_at,
            sections_count=sections,
            estimated_pages=estimated_pages,
        )

    # DPGF info
    dpgf_info = None
    dpgf_doc = next((d for d in project_docs if d.type == "dpgf_template"), None)
    if dpgf_doc:
        dpgf_info = DpgfExportInfo(file_name=dpgf_doc.file_name, file_id=dpgf_doc.id)

    # DPGF remplie info
    project = _get_project_or_404(project_id, user.organization_id, db)
    dpgf_remplie = None
    if project.dpgf_remplie_url:
        dpgf_remplie = {
            "file_name": project.dpgf_remplie_name,
            "verification": project.dpgf_remplie_check or {},
        }

    # Project documents list for preview
    project_docs_export = [
        ProjectDocumentExportItem(
            id=d.id,
            file_name=d.file_name,
            type=d.type or "autre",
            pdf_preview_url=d.pdf_preview_url,
        )
        for d in project_docs
    ]

    # C13b — convention de nommage du RC (signalée dans l'UI d'export)
    from services.export_naming import detect_naming_convention
    rc_doc = next(
        (d for d in project_docs if (d.type or "") == "rc" and d.extracted_text
         and not d.extracted_text.startswith("[document volumineux")),
        None,
    )
    convention = detect_naming_convention(rc_doc.extracted_text) if rc_doc else None

    # Export « 0/N » (décision du 25/10) : N exigences relevées, combien ont
    # leur extrait retrouvé dans le DCE, M confirmées par l'utilisateur — plus
    # de « couvertes » (jamais posé par Synorix).
    detail = ExportDetail(
        compliance_total=len(compliance_items),
        compliance_confirmed=sum(1 for i in compliance_items if i.status == STATUT_CONFIRMEE),
        compliance_with_source=sum(1 for i in compliance_items if i.source_excerpt),
        checklist_total=len(checklist_items),
        checklist_present=sum(1 for i in checklist_items if i.status == "present"),
        has_memoire=memoire is not None,
        has_dpgf=dpgf_doc is not None,
        compliance_items=[
            ComplianceExportItem(
                id=i.id, exigence_text=i.exigence_text, category=i.category,
                priority=i.priority, status=i.status,
                groupe=groupe_de_categorie(i.category),
                source_document=i.source_document, source_page=i.source_page,
                source_verifiee=bool(i.source_excerpt),
            )
            for i in compliance_items
        ],
        checklist_items=checklist_export,
        project_documents=project_docs_export,
        pieces_zip=[
            PieceZipExport(dossier=e.dossier, nom=e.nom, genre=e.genre,
                           document_projet_id=e.document_projet_id)
            for e in plan.entrees
        ],
        memoire_info=memoire_info,
        dpgf_info=dpgf_info,
        dpgf_remplie=dpgf_remplie,
        naming_convention=convention["template"] if convention else None,
    )
    if recalees:
        try:
            db.commit()
        except Exception:
            logger.exception("Recalage des pièces du coffre non enregistré (%s)", project_id)
            db.rollback()
    return detail


@router.get("/{project_id}/export/summary", response_model=ExportSummary)
def get_export_summary(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, user.organization_id, db)

    from services.exigences import requete_exigences_du_dossier
    compliance_items = requete_exigences_du_dossier(db, project).all()
    checklist_items = db.query(ChecklistItem).filter(ChecklistItem.project_id == project_id).all()
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    project_docs = (db.query(ProjectDocument)
                    .options(defer(ProjectDocument.extracted_text))
                    .filter(ProjectDocument.project_id == project_id).all())

    return ExportSummary(
        compliance_total=len(compliance_items),
        compliance_confirmed=sum(1 for i in compliance_items if i.status == STATUT_CONFIRMEE),
        compliance_with_source=sum(1 for i in compliance_items if i.source_excerpt),
        checklist_total=len(checklist_items),
        checklist_present=sum(1 for i in checklist_items if i.status == "present"),
        has_memoire=memoire is not None,
        has_dpgf=any(d.type == "dpgf_template" for d in project_docs),
    )


@router.get("/{project_id}/export/docx")
@limiter.limit("20/minute")
def export_docx(
    request: Request,
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, user.organization_id, db)

    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    if not memoire:
        raise HTTPException(status_code=404, detail="Mémoire non généré")

    from models.organization import Organization
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()

    # Point 7 — SOURCE UNIQUE : même builder complet que /memoire/export-docx
    # (page de garde, organigramme, carte, logo). Le builder nu laissait le
    # bouton de l'étape Export produire un docx sans page de garde ni images.
    from routers.memoire import build_project_memoire_docx
    docx_bytes = build_project_memoire_docx(project, memoire, org, db)

    filename = f"Memoire_Technique_{project.name.replace(' ', '_')}.docx"
    ascii_name = filename.encode("ascii", errors="replace").decode("ascii")
    utf8_name = quote(filename, safe="")
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{utf8_name}"},
    )


@router.get("/{project_id}/export/zip")
@limiter.limit("10/minute")
def export_zip(
    request: Request,
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """
    Export a ZIP containing ONLY the deliverables produced by the company.
    Never includes originals from the DCE (RC, CCAP, CCTP, blank templates).

    Contents:
      - 01_Candidature/ : vault documents linked via checklist (jamais une
                          pièce expirée ou supprimée — B1)
                          + ProjectDocuments flagged is_user_completed=True
      - 02_Offre/       : Memoire_technique.docx + DPGF remplie
                          + user-completed offer documents (AE complété, etc.)
    """
    project = _get_project_or_404(project_id, user.organization_id, db)
    from models.document import Document

    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    project_docs = (db.query(ProjectDocument)
                    .options(defer(ProjectDocument.extracted_text))
                    .filter(ProjectDocument.project_id == project_id).all())
    checklist_items = db.query(ChecklistItem).filter(ChecklistItem.project_id == project_id).all()
    linked_doc_ids = {ci.linked_document_id for ci in checklist_items if ci.linked_document_id}
    docs_par_id = {
        # Filtre org (S2.3) : seuls les Documents de l'org appelante entrent
        # dans le ZIP, même si un linked_document_id pointe ailleurs.
        d.id: d for d in db.query(Document).filter(
            Document.id.in_(linked_doc_ids),
            Document.organization_id == user.organization_id,
            Document.deleted_at.is_(None),
        ).all()
    } if linked_doc_ids else {}

    # Même plan que l'écran Export (pieces_zip) : ce qui est listé est ce qui part.
    plan = _plan_du_zip(db, project, user.organization_id, checklist_items=checklist_items,
                        project_docs=project_docs, memoire=memoire, docs_par_id=docs_par_id)
    root = plan.racine
    warnings: list[str] = list(plan.avertissements)

    # T5 — l'archive est assemblée sur DISQUE (fichier temp), pas en RAM :
    # plusieurs livrables volumineux × exports concurrents saturaient la mémoire.
    tmp = tempfile.NamedTemporaryFile(prefix="synorix_zip_", suffix=".zip", delete=False)
    tmp_path = tmp.name

    try:
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zf:
            for entree in plan.entrees:
                if entree.genre != "memoire":
                    zf.write(entree.chemin, f"{root}/{entree.dossier}/{entree.nom}")
                    continue
                # C13a — le PDF est la version dépôt par défaut ; conversion
                # impossible → DOCX (jamais de ZIP sans mémoire).
                from routers.memoire import build_project_memoire_docx
                docx_bytes = build_project_memoire_docx(project, memoire, plan.org, db)
                if entree.nom.endswith(".pdf"):
                    try:
                        zf.writestr(f"{root}/{entree.dossier}/{entree.nom}", docx_to_pdf(docx_bytes))
                        continue
                    except PdfConversionError as exc:
                        logger.warning("PDF mémoire indisponible pour le ZIP : %s", exc)
                warnings.append(
                    "Mémoire fourni en Word (conversion PDF indisponible sur ce serveur)"
                )
                zf.writestr(f"{root}/{entree.dossier}/Memoire_technique.docx", docx_bytes)

            # ── Ensure 3 folders exist (even if empty) ────────────────────────
            for sub in ("01_Candidature", "02_Offre", "03_Technique"):
                folder_path = f"{root}/{sub}/"
                if folder_path not in {info.filename for info in zf.filelist}:
                    zf.writestr(folder_path, "")

        tmp.flush()
        tmp.close()
    except BaseException:
        try:
            tmp.close()
        except Exception:
            pass
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise

    zip_filename = f"{root}.zip"
    ascii_zip = zip_filename.encode("ascii", errors="replace").decode("ascii")
    utf8_zip = quote(zip_filename, safe="")
    headers = {
        "Content-Disposition": f"attachment; filename=\"{ascii_zip}\"; filename*=UTF-8''{utf8_zip}",
        "X-Export-Warnings": json.dumps(warnings),
    }

    from services.audit_logger import log_action
    log_action(
        db, user, "export.zip",
        target_type="project", target_id=project_id,
        extra={
            "project_name": project.name,
            "lot": project.selected_lot,
            "warnings_count": len(warnings),
            "size_bytes": os.path.getsize(tmp_path),
        },
    )

    def _stream_and_cleanup():
        """Streame l'archive par blocs depuis le disque puis la supprime."""
        try:
            with open(tmp_path, "rb") as fh:
                while True:
                    chunk = fh.read(65536)
                    if not chunk:
                        break
                    yield chunk
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    return StreamingResponse(_stream_and_cleanup(), media_type="application/zip", headers=headers)


# ── Plan du ZIP : une seule source pour l'archive ET pour l'écran Export ─────
# Décision du 25/10 (point 3) : « Jointe » est un fait vérifiable — le fichier
# part dans le ZIP. Le plan dit exactement ce qui part : l'écran le liste
# (pieces_zip), export_zip l'écrit. Jamais un original du DCE.

@dataclass
class EntreeZip:
    dossier: str                       # 01_Candidature | 02_Offre | 3_ANNEXES
    nom: str                           # nom final dans le dossier
    genre: str                         # coffre | complete | memoire | dpgf_remplie | annexe
    chemin: Optional[FilePath] = None  # fichier sur disque ; None : mémoire généré à l'export
    document_id: Optional[str] = None          # Document.id (coffre, annexe)
    document_projet_id: Optional[str] = None   # ProjectDocument.id (formulaire rempli)


@dataclass
class PlanZip:
    racine: str
    org: object = None
    entrees: list = field(default_factory=list)
    avertissements: list = field(default_factory=list)
    coffre_joint: dict = field(default_factory=dict)   # Document.id → EntreeZip
    projet_joint: dict = field(default_factory=dict)   # ProjectDocument.id → EntreeZip


# DPGF/AE complétés par l'utilisateur → 02_Offre ; le reste (DC1, DC2,
# déclaration sur l'honneur…) → 01_Candidature.
OFFER_COMPLETED_TYPES = {"dpgf_template", "acte_engagement_template"}


def _plan_du_zip(db: Session, project, org_id: str, *, checklist_items, project_docs,
                 memoire, docs_par_id: dict) -> PlanZip:
    """Ce que le ZIP contient, dans l'ordre : pièces du coffre (ordre du RC,
    chacune UNE fois même liée à deux lignes, jamais expirée), formulaires
    remplis, mémoire, annexes, DPGF remplie. Un fichier absent du serveur
    n'est pas listé : il est signalé « à redéposer »."""
    from models.document import Document
    from models.organization import Organization
    from services.export_naming import apply_convention, detect_naming_convention
    from services.vault_classifier import effective_expiry_date, is_document_expired

    org = db.query(Organization).filter(Organization.id == org_id).first()
    org_name = org.name if org else "Entreprise"
    rc_doc = next(
        (d for d in project_docs if (d.type or "") == "rc" and d.extracted_text
         and not d.extracted_text.startswith("[document volumineux")),
        None,
    )
    convention = detect_naming_convention(rc_doc.extracted_text) if rc_doc else None   # C13b
    lot_segment = project.selected_lot or (project.selected_lot_name or "lot").split("—")[0].strip()
    lot_suffix = "_" + _sanitize(project.selected_lot_name) if project.selected_lot_name else ""
    date_str = datetime.utcnow().strftime("%Y%m%d")
    plan = PlanZip(racine=f"Reponse_AO_{_sanitize(project.name)}{lot_suffix}_{date_str}", org=org)
    vus: dict[str, int] = {}
    signales: set[str] = set()

    def _piece_arcname(counter: int, original_name: str) -> str:
        """Numérotation ordre RC + convention du RC si détectée."""
        stem = FilePath(original_name).stem
        ext = FilePath(original_name).suffix
        if convention:
            named = apply_convention(convention["template"], lot=lot_segment,
                                     entreprise=org_name, piece=stem)
            return f"{counter:02d}_{named}{ext}"
        return f"{counter:02d}_{original_name}"

    def _signaler(cle: str, texte: str) -> None:
        if cle not in signales:
            signales.add(cle)
            plan.avertissements.append(texte)

    def _ajouter(dossier, nom_voulu, file_url, genre, cle, nom_affiche, **ids):
        chemin = _chemin_local(file_url)
        if chemin is None or not chemin.exists():
            _signaler(cle, f"{nom_affiche} : fichier introuvable sur le serveur — à redéposer")
            return None
        entree = EntreeZip(dossier, _nom_dans_zip(dossier, nom_voulu, chemin, vus), genre, chemin, **ids)
        plan.entrees.append(entree)
        return entree

    def _hors_dossier(doc) -> bool:
        """B1 — jamais une pièce du coffre expirée (date de fin jugée aujourd'hui)."""
        if not is_document_expired(doc):
            return False
        fin = effective_expiry_date(doc.type, doc.expiry_date, doc.issued_date)
        quand = f" (fin de validité le {fin.strftime('%d/%m/%Y')})" if fin else ""
        _signaler(doc.id, f"{doc.file_name} : à renouveler{quand} — laissée hors du dossier")
        return True

    # ── 01_Candidature : pièces du coffre liées, dans l'ordre du RC ───────────
    compteur = 0
    for ci in sorted(checklist_items,
                     key=lambda c: c.rc_position if c.rc_position is not None else 999_999):
        doc = docs_par_id.get(ci.linked_document_id) if ci.linked_document_id else None
        if not doc or doc.id in plan.coffre_joint or doc.id in signales or _hors_dossier(doc):
            continue   # un même document lié à deux lignes ne part qu'une fois
        entree = _ajouter("01_Candidature", _piece_arcname(compteur + 1, doc.file_name),
                          doc.file_url, "coffre", doc.id, doc.file_name, document_id=doc.id)
        if entree:
            compteur += 1
            plan.coffre_joint[doc.id] = entree

    # ── Formulaires remplis par l'utilisateur (DC1, DC2, AE, DPGF…) ──────────
    for doc in project_docs:
        if not getattr(doc, "is_user_completed", False):
            continue
        if (doc.type or "autre") in OFFER_COMPLETED_TYPES:
            entree = _ajouter("02_Offre", doc.file_name, doc.file_url, "complete", doc.id,
                              doc.file_name, document_projet_id=doc.id)
        else:
            entree = _ajouter("01_Candidature", _piece_arcname(compteur + 1, doc.file_name),
                              doc.file_url, "complete", doc.id, doc.file_name,
                              document_projet_id=doc.id)
            compteur += 1 if entree else 0
        if entree:
            plan.projet_joint[doc.id] = entree

    # ── 02_Offre : mémoire technique, généré à l'export (PDF ; Word sans LibreOffice)
    if memoire:
        nom = "Memoire_technique.pdf" if soffice_available() else "Memoire_technique.docx"
        plan.entrees.append(EntreeZip("02_Offre", nom, "memoire"))
    else:
        plan.avertissements.append("Mémoire technique : à générer à l'étape Mémoire")

    # ── 3_ANNEXES : pièces du coffre cochées au pré-vol (ownership org) ──────
    annexe_ids = list(((memoire.variables if memoire else None) or {}).get(
        "annexe_document_ids") or [])
    if annexe_ids:
        for doc in db.query(Document).filter(
            Document.id.in_(annexe_ids),
            Document.organization_id == org_id,
            Document.deleted_at.is_(None),
        ).all():
            if not _hors_dossier(doc):
                _ajouter("3_ANNEXES", doc.file_name, doc.file_url, "annexe", f"annexe-{doc.id}",
                         doc.file_name, document_id=doc.id)

    # ── 02_Offre : DPGF remplie déposée à l'étape Export ─────────────────────
    if project.dpgf_remplie_url and project.dpgf_remplie_name:
        _ajouter("02_Offre", f"DPGF_remplie_{project.dpgf_remplie_name}", project.dpgf_remplie_url,
                 "dpgf_remplie", "dpgf_remplie", project.dpgf_remplie_name)
    elif any((d.type or "") == "dpgf_template" for d in project_docs):
        plan.avertissements.append("DPGF remplie : à déposer")

    # L'AE se dépose complété ; sa signature vient à l'attribution
    # (ATTRI1 ; service-public R17445, F23784) : « non signé » était faux.
    has_completed_ae = any(
        (d.type or "") == "acte_engagement_template" and getattr(d, "is_user_completed", False)
        for d in project_docs
    )
    if not has_completed_ae and any((d.type or "") == "acte_engagement_template" for d in project_docs):
        plan.avertissements.append("Acte d'engagement complété : à joindre")
    return plan


def _etat_piece(item, docs_par_id: dict, docs_projet: dict, plan: PlanZip):
    """(jointe, nom, valable jusqu'au) d'une ligne de checklist — un FAIT : le
    fichier part dans le ZIP, et une pièce du coffre est valable et datée."""
    from services.vault_classifier import current_document_status, effective_expiry_date
    if (item.source_kind or "vault") == "vault":
        doc = docs_par_id.get(item.linked_document_id) if item.linked_document_id else None
        if doc and doc.id in plan.coffre_joint and current_document_status(doc) in ("valid", "expiring_soon"):
            return True, doc.file_name, effective_expiry_date(doc.type, doc.expiry_date, doc.issued_date)
        return False, None, None
    complet = docs_projet.get(item.completed_project_doc_id) if item.completed_project_doc_id else None
    if complet and complet.id in plan.projet_joint and item.status == "present":
        return True, complet.file_name, None
    return False, None, None


def _chemin_local(file_url: Optional[str]) -> Optional[FilePath]:
    """Fichier local d'un /uploads/… (S3 : pas encore géré, cf. B22)."""
    if not file_url or not file_url.startswith("/uploads/"):
        return None
    return UPLOADS_ROOT / file_url.removeprefix("/uploads/")


def _nom_dans_zip(dossier: str, nom_voulu: str, chemin: FilePath, vus: dict) -> str:
    """Nom nettoyé (sans accents ni caractères spéciaux), extension du fichier
    réel, doublons du même dossier suffixés _2, _3…"""
    ext = chemin.suffix
    stem = _sanitize(FilePath(nom_voulu).stem)
    nom = f"{stem}{ext}"
    cle = f"{dossier}/{nom}"
    if cle in vus:
        vus[cle] += 1
        nom = f"{stem}_{vus[cle]}{ext}"
    else:
        vus[cle] = 1
    return nom


# ── Helpers ──────────────────────────────────────────────────────────────────

def _sanitize(name: str) -> str:
    """Normalize filename: remove accents, replace spaces/special chars with underscores."""
    # Decompose unicode and strip accents
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    # Replace non-alphanumeric (except dot, hyphen) with underscore
    clean = re.sub(r"[^a-zA-Z0-9.\-]", "_", ascii_str)
    # Collapse multiple underscores
    clean = re.sub(r"_+", "_", clean).strip("_")
    return clean or "document"


# ── Document download ────────────────────────────────────────────────────────

@router.get("/{project_id}/documents/{doc_id}/download")
def download_document(
    project_id: str,
    doc_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Download a project document (original file)."""
    _get_project_or_404(project_id, user.organization_id, db)
    doc = db.query(ProjectDocument).filter(
        ProjectDocument.id == doc_id,
        ProjectDocument.project_id == project_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")

    file_path = _resolve_local_path(doc.file_url)
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable sur le serveur")

    media_type = mimetypes.guess_type(doc.file_name)[0] or "application/octet-stream"
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=doc.file_name,
    )


@router.get("/{project_id}/documents/{doc_id}/preview")
def preview_document(
    project_id: str,
    doc_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Preview a project document inline (Content-Disposition: inline)."""
    _get_project_or_404(project_id, user.organization_id, db)
    doc = db.query(ProjectDocument).filter(
        ProjectDocument.id == doc_id,
        ProjectDocument.project_id == project_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")

    # Prefer PDF preview if available
    preview_url = doc.pdf_preview_url or doc.file_url
    file_path = _resolve_local_path(preview_url)
    if not file_path or not file_path.exists():
        # Fallback to original file
        file_path = _resolve_local_path(doc.file_url)
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable sur le serveur")

    media_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        headers={"Content-Disposition": f"inline; filename=\"{doc.file_name.encode('ascii', errors='replace').decode('ascii')}\"; filename*=UTF-8''{quote(doc.file_name, safe='')}"},
    )


# ── DPGF filled upload + verification ───────────────────────────────────────

_DPGF_EXTENSIONS = frozenset({".xlsx", ".xlsm", ".xls", ".ods", ".pdf"})
# B8 — ordre de grandeur : un bordereau rempli pèse moins de 5 Mo en tableur,
# mais sa version signée et scannée en couleur peut dépasser 20 Mo : 50 Mo
# (plafond inchangé, désormais appliqué avant toute lecture).
_DPGF_MAX_SIZE = 50 * 1024 * 1024
_storage = FileStorage()


@router.post("/{project_id}/dpgf-upload")
async def upload_filled_dpgf(
    request: Request,
    project_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Upload a filled DPGF and run automatic verification."""
    project = _get_project_or_404(project_id, user.organization_id, db)

    regle = RegleDepot(_DPGF_EXTENSIONS, _DPGF_MAX_SIZE, "XLSX, XLSM, XLS, ODS ou PDF")
    with await recevoir_fichier(request, file, regle) as recu:
        file_url = await _storage.upload_stream(
            recu.flux, file.filename or f"dpgf_remplie{recu.extension}",
            prefix=f"projects/{project_id}/dpgf_remplie",
            content_type=file.content_type,
        )

    # Run verification
    local_path = _resolve_local_path(file_url)
    verification = {"valid": True, "warnings": [], "total_ht": None, "nb_lignes": 0, "nb_lignes_remplies": 0, "nb_lignes_vides": 0}
    if local_path and local_path.exists():
        # R8 — parse openpyxl/xlrd hors event-loop (règle WSL2).
        verification = await asyncio.to_thread(check_dpgf, local_path)

    # Save to project
    project.dpgf_remplie_url = file_url
    project.dpgf_remplie_name = file.filename
    project.dpgf_remplie_check = verification
    db.commit()

    return {
        "file_name": file.filename,
        "file_url": file_url,
        "verification": verification,
    }


@router.get("/{project_id}/dpgf-check")
def get_dpgf_check(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Get the latest DPGF verification result."""
    project = _get_project_or_404(project_id, user.organization_id, db)
    if not project.dpgf_remplie_url:
        raise HTTPException(status_code=404, detail="Aucune DPGF remplie déposée")
    return {
        "file_name": project.dpgf_remplie_name,
        "verification": project.dpgf_remplie_check or {},
    }


@router.get("/{project_id}/dpgf-remplie/download")
def download_filled_dpgf(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Download the filled DPGF file."""
    project = _get_project_or_404(project_id, user.organization_id, db)
    if not project.dpgf_remplie_url:
        raise HTTPException(status_code=404, detail="Aucune DPGF remplie déposée")

    file_path = _resolve_local_path(project.dpgf_remplie_url)
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable sur le serveur")

    filename = project.dpgf_remplie_name or "DPGF_remplie"
    media_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=filename,
    )


def _resolve_local_path(file_url: str) -> FilePath | None:
    """Resolve a /uploads/... URL to a local file path."""
    if not file_url or not file_url.startswith("/uploads/"):
        return None
    rel = file_url.removeprefix("/uploads/")
    return UPLOADS_ROOT / rel


# R11 — source UNIQUE (filtre org + soft-delete) ; fini les 7 copies.
from services.project_access import get_owned_project as _get_project_or_404
