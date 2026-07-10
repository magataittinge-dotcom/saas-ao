"""
Checklist matcher — pure Python, no AI call.

Branches on each requirement's ``source_kind``:

* ``vault``        → keyword match against the company's vault documents
                     (Document table — Kbis, attestations, assurances, références…).
* ``dce_template`` → look up the matching ProjectDocument template provided by
                     the maître d'ouvrage in the DCE (DC1/DC2/AE/DPGF/cadre…).
                     Also link any user-completed copy uploaded to the project.

The matcher returns dicts ready for ChecklistItem creation. Its caller persists
them to the DB.
"""
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from models.document import Document
from models.project import ProjectDocument
import logging

logger = logging.getLogger(__name__)


# ── Vault keyword rules ──────────────────────────────────────────────────────
# Maps requirement-text keywords → DOCUMENT_TYPES values. Only real vault types
# (DC1/DC2/AE/DPGF live as dce_templates now and don't appear here).
_VAULT_KEYWORDS: list[tuple[list[str], str]] = [
    (["kbis", "extrait kbis", "registre du commerce"], "kbis"),
    (["urssaf", "attestation de vigilance"], "urssaf"),
    (["fiscale", "fiscal", "dgfip", "impôts", "regularité fiscale", "régularité fiscale"], "fiscal"),
    (["décennale", "assurance décennale"], "decennale"),
    (["responsabilité civile", "rc pro", "rc professionnelle", "assurance rc"], "rc_civile"),
    (["trc", "tous risques chantier"], "trc"),
    (["dommages-ouvrage", "dommages ouvrage"], "dommages_ouvrage"),
    (["pro btp", "pro-btp"], "pro_btp"),
    (["cibtp", "ci-btp", "congés payés btp"], "cibtp"),
    (["qualibat"], "qualibat"),
    (["rge", "reconnu garant de l'environnement"], "rge"),
    (["caces"], "caces"),
    (["amiante ss4", "ss4 amiante", "amiante sous-section 4"], "amiante_ss4"),
    (["chiffre d'affaires", "ca des", "bilan", "capacité financière"], "chiffre_affaires"),
    (["effectifs", "déclaration d'effectif", "déclaration des effectifs"], "effectifs"),
    (["organigramme"], "organigramme_doc"),
    (["références chantiers", "références travaux", "liste des travaux", "attestations de bonne exécution", "attestation de bonne exécution"], "attestation_travaux"),
    (["dume"], "dume"),
    (["pouvoir", "habilitation à signer", "habilité à signer"], "pouvoir"),
    (["rib", "relevé d'identité bancaire"], "rib"),
    (["déclaration sur l'honneur"], "declaration_honneur"),
]


def _detect_vault_type(exigence: str) -> Optional[str]:
    """Return the vault DOCUMENT_TYPES value matching this requirement, or None."""
    lower = exigence.lower()
    for keywords, doc_type in _VAULT_KEYWORDS:
        if any(kw in lower for kw in keywords):
            return doc_type
    return None


def _vault_doc_status(vault_doc: Document) -> str:
    """Map Document.status to the CHECKLIST_STATUSES enum.

    C10 — « valide » = reconnu ET daté : un document non vérifié (unverified)
    ou non classé matché sur une exigence donne un ⚠️ "warning", jamais ✓."""
    if vault_doc.status == "expired":
        return "expire"
    if vault_doc.status == "expiring_soon":
        return "expiration_proche"
    if vault_doc.status in ("unverified", "unclassified"):
        return "warning"
    return "present"


# Statuts comptant comme « pièce conforme » dans le score X/Y (C10).
# expiration_proche reste conforme (encore valide aujourd'hui) ;
# warning/expire/manquant ne le sont pas ; non_applicable sort du total.
_CONFORME_STATUSES = {"present", "expiration_proche"}

# C12 — templates DCE exigeant une signature : sans confirmation explicite
# (« Je confirme avoir signé »), la pièce ne compte pas conforme.
# Doit rester ALIGNÉ avec SIGNABLE_TYPES du front (CandidatureSectionTemplates).
SIGNABLE_TEMPLATE_TYPES = {
    "acte_engagement_template", "dc1_template", "dc2_template", "declaration_honneur",
}


def _is_conforme(item) -> bool:
    if item.status not in _CONFORME_STATUSES:
        return False
    if (
        getattr(item, "source_kind", "") == "dce_template"
        and getattr(item, "document_type_required", "") in SIGNABLE_TEMPLATE_TYPES
        and not getattr(item, "signature_confirmed", False)
    ):
        return False
    return True


# Le score ne compte QUE les pièces dont l'entreprise est responsable :
# 'fournir' (coffre) + 'completer' (formulaires à signer). Les jalons produits
# par Synorix ('synorix') et les pièces à workflow dédié ('workflow', DPGF/BPU)
# sont hors score.
_SCORED_GROUPS = {"fournir", "completer"}


def conformity_score(items) -> dict:
    """Score de conformité « X/Y pièces conformes » de la checklist."""
    considered = [
        i for i in items
        if i.status != "non_applicable"
        and getattr(i, "document_group", "fournir") in _SCORED_GROUPS
    ]
    conformes = sum(1 for i in considered if _is_conforme(i))
    return {"conformes": conformes, "total": len(considered)}


def _pick_best_vault_doc(candidates: list[Document]) -> Document:
    """Prefer non-expired, then most recent expiry."""
    return sorted(
        candidates,
        key=lambda d: (
            0 if d.status != "expired" else 1,
            d.expiry_date or date.min,
        ),
        reverse=True,
    )[0]


# ── Per-requirement matching ─────────────────────────────────────────────────

def match_requirement_to_checklist_item(
    requirement: dict,
    project_id: str,
    db: Session,
    vault_by_type: Optional[dict[str, list[Document]]] = None,
) -> dict:
    """Build the ChecklistItem payload for a single requirement.

    ``vault_by_type`` is an optional pre-indexed map ``{type: [Document, …]}``
    for the project's organization — pass it to avoid one query per call when
    matching a whole batch.

    The returned dict carries every ChecklistItem column the caller needs:
    ``document_type_required, source_kind, linked_document_id,
    template_project_doc_id, completed_project_doc_id, status, details,
    source_in_rc``.
    """
    exigence = requirement.get("exigence", "") or ""
    source_kind = requirement.get("source_kind") or "vault"
    expected_template_type = requirement.get("expected_template_type")
    source_excerpt = requirement.get("source_excerpt")

    base = {
        "document_type_required": "",
        "source_kind": source_kind,
        "linked_document_id": None,
        "template_project_doc_id": None,
        "completed_project_doc_id": None,
        "status": "manquant",
        "details": exigence,
        "source_in_rc": source_excerpt,
    }

    # ── DCE template branch ─────────────────────────────────────────────────
    if source_kind == "dce_template":
        if not expected_template_type:
            base["document_type_required"] = "autre"
            base["details"] = (
                f"{exigence} — type de template DCE non précisé par l'IA."
            )
            return base

        base["document_type_required"] = expected_template_type

        templates = (
            db.query(ProjectDocument)
            .filter(
                ProjectDocument.project_id == project_id,
                ProjectDocument.type == expected_template_type,
                ProjectDocument.is_user_completed.is_(False),
            )
            .all()
        )
        completed = (
            db.query(ProjectDocument)
            .filter(
                ProjectDocument.project_id == project_id,
                ProjectDocument.type == expected_template_type,
                ProjectDocument.is_user_completed.is_(True),
            )
            .all()
        )

        if len(templates) > 1:
            logger.warning(
                "match_requirement: %d templates of type=%s found for project=%s — "
                "using the first (%s)",
                len(templates), expected_template_type, project_id,
                templates[0].file_name,
            )

        if templates:
            tpl = templates[0]
            base["template_project_doc_id"] = tpl.id
            if completed:
                base["completed_project_doc_id"] = completed[0].id
                base["status"] = "present"
                base["details"] = (
                    f"Template {expected_template_type} complété "
                    f"({completed[0].file_name})."
                )
            else:
                base["status"] = "manquant"
                base["details"] = (
                    f"Template {expected_template_type} fourni dans le DCE "
                    f"({tpl.file_name}) — à compléter par l'utilisateur."
                )
        else:
            # Template missing in DCE — clearly explain so the user can re-upload.
            base["status"] = "manquant"
            base["details"] = (
                f"Template {expected_template_type} non trouvé dans le DCE — "
                f"vérifier l'upload ou demander la pièce au maître d'ouvrage."
            )
        return base

    # ── Vault branch (default) ──────────────────────────────────────────────
    detected_type = _detect_vault_type(exigence)
    if not detected_type:
        base["document_type_required"] = "autre"
        return base

    base["document_type_required"] = detected_type

    if vault_by_type is None:
        candidates = (
            db.query(Document)
            .filter(Document.type == detected_type)
            .all()
        )
    else:
        candidates = vault_by_type.get(detected_type, [])

    if candidates:
        matched = _pick_best_vault_doc(candidates)
        base["linked_document_id"] = str(matched.id)
        base["status"] = _vault_doc_status(matched)

    return base


def _index_vault_by_type(vault_documents: list[Document]) -> dict[str, list[Document]]:
    by_type: dict[str, list[Document]] = {}
    for doc in vault_documents:
        t = (doc.type or "autre").lower()
        by_type.setdefault(t, []).append(doc)
    return by_type


# ── Backwards-compatible public class used by routers/analysis.py ────────────

class ChecklistMatcher:
    async def match(
        self,
        candidature_requirements: list[dict],
        vault_documents: list[Document],
        project_id: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> list[dict]:
        """Match a batch of candidature requirements.

        ``project_id`` and ``db`` are required to resolve dce_template
        requirements. Without them, dce_template items are returned with
        status='manquant' and a clear ``details`` message.
        """
        vault_by_type = _index_vault_by_type(vault_documents)
        checklist: list[dict] = []
        for req in candidature_requirements:
            if (req.get("source_kind") == "dce_template") and (project_id is None or db is None):
                checklist.append({
                    "document_type_required": req.get("expected_template_type") or "autre",
                    "source_kind": "dce_template",
                    "linked_document_id": None,
                    "template_project_doc_id": None,
                    "completed_project_doc_id": None,
                    "status": "manquant",
                    "details": (
                        f"{req.get('exigence', '')} — résolution dce_template "
                        f"impossible (project_id ou db manquants)."
                    ),
                    "source_in_rc": req.get("source_excerpt"),
                })
                continue

            checklist.append(
                match_requirement_to_checklist_item(
                    req, project_id or "", db, vault_by_type=vault_by_type,
                )
            )
        return checklist
