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
import re
import unicodedata
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from models.document import Document
from models.project import Project, ProjectDocument
from services.vault_classifier import (
    current_document_status,
    effective_expiry_date,
    is_document_expired,
)
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


def _vault_doc_status(vault_doc: Document, today: Optional[date] = None) -> str:
    """Map Document.status to the CHECKLIST_STATUSES enum.

    C10 — « valide » = reconnu ET daté : un document non vérifié (unverified)
    ou non classé matché sur une exigence donne un ⚠️ "warning", jamais ✓.
    B1 — statut jugé à la date du jour (une date de fin passée compte même
    si le job quotidien n'a pas encore rafraîchi le statut stocké)."""
    status = current_document_status(vault_doc, today)
    if status == "expired":
        return "expire"
    if status == "expiring_soon":
        return "expiration_proche"
    if status in ("unverified", "unclassified"):
        return "warning"
    return "present"


# Statuts comptant comme « pièce conforme » dans le score X/Y (C10).
# expiration_proche reste conforme (encore valide aujourd'hui) ;
# warning/expire/manquant ne le sont pas ; non_applicable sort du total.
_CONFORME_STATUSES = {"present", "expiration_proche"}

# ── Signature des pièces (C12 révisé) ────────────────────────────────────────
# Sources vérifiées le 25/10/2026 (notes nuit-25-10/B1 §2 lignes 9-10, §5) :
#   • service-public F32144 et F32106 : « La règlementation n'impose pas que le
#     Dume ou les formulaires DC1, DC2 soient signés […]. Cependant, l'acheteur
#     public peut exiger dans les documents de la consultation que la
#     candidature soit signée. »
#   • acte d'engagement (ATTRI1 ; service-public R17445, F23784) : la signature
#     « n'est plus aujourd'hui requise qu'au stade de l'attribution du marché
#     public », sauf si l'acheteur l'exige dès l'offre.
# → pour ces pièces, « Je confirme avoir signé » n'est demandé que si l'extrait
#   du document de la consultation rattaché à la ligne (source_in_rc, texte
#   ancré mot pour mot) exige une signature. La phrase reformulée par l'IA
#   (exigence_text) n'est PAS lue : ses exemples disent « signer » par défaut.
#   Le détecteur du RC (bloc 9) remplacera cette lecture de l'extrait.
SIGNATURE_SI_EXIGEE_TYPES = {
    "dc1_template", "dc2_template", "dume", "acte_engagement_template",
}
# Déclaration sur l'honneur (formulaire du DCE) : confirmation toujours
# demandée — inchangé, aucune source vérifiée pour une pièce isolée.
SIGNATURE_TOUJOURS_TYPES = {"declaration_honneur"}

_MOT_SIGNATURE = re.compile(r"\bsign(?:e|ee|es|ees|er|ature|atures|era|eront)\b")
# Négation dans la même proposition, juste avant le mot (« n'a pas à être
# signée », « non signé », « sans signature », « ne sont pas tenus de signer »).
_NEGATION_AVANT = re.compile(
    r"\b(?:pas|non|sans|aucune?|jamais|nullement|dispensee?s?)\b[^.;:!?]{0,40}$")
# Signature renvoyée à l'attribution (« sera signé par l'attributaire »,
# « l'attributaire devra signer », « requise qu'au stade de l'attribution »).
_ATTRIBUTION_AVANT = re.compile(r"\b(?:attributaire|titulaire|attribution)\b[^.;:!?]{0,40}$")
_ATTRIBUTION_OU_NEGATION_APRES = re.compile(
    r"^[^.;:!?]{0,100}?(?:\battributaire\b|\btitulaire\b|\battribution\b|n'est pas|n'est plus"
    r"|ne sont pas|ne sera pas|ne seront pas"
    r"|\bpas (?:requise?s?|exigee?s?|obligatoires?|demandee?s?|necessaires?|imposee?s?)\b)")


def _normaliser(texte: str) -> str:
    s = unicodedata.normalize("NFKD", texte.lower().replace("’", "'"))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s)


def extrait_exige_signature(extrait: Optional[str]) -> bool:
    """Vrai si l'extrait du document de la consultation EXIGE une signature au
    dépôt : un mot de la famille « signer » ni nié ni renvoyé à l'attribution."""
    if not extrait:
        return False
    texte = _normaliser(extrait)
    for m in _MOT_SIGNATURE.finditer(texte):
        avant, apres = texte[max(0, m.start() - 60):m.start()], texte[m.end():m.end() + 120]
        if _NEGATION_AVANT.search(avant) or _ATTRIBUTION_AVANT.search(avant):
            continue
        if _ATTRIBUTION_OU_NEGATION_APRES.search(apres):
            continue
        return True
    return False


def signature_requise(item) -> bool:
    """La confirmation « Je confirme avoir signé » est-elle demandée pour cette
    ligne ? Source unique pour le score, l'API et l'écran."""
    type_ = getattr(item, "document_type_required", "") or ""
    if type_ in SIGNATURE_TOUJOURS_TYPES:
        return getattr(item, "source_kind", "") == "dce_template"
    if type_ in SIGNATURE_SI_EXIGEE_TYPES:
        return extrait_exige_signature(getattr(item, "source_in_rc", None))
    return False


def _is_conforme(item) -> bool:
    if item.status not in _CONFORME_STATUSES:
        return False
    if signature_requise(item) and not getattr(item, "signature_confirmed", False):
        return False
    return True


# Le score ne compte QUE les pièces dont l'entreprise est responsable :
# 'fournir' (coffre) + 'completer' (formulaires à compléter). Les jalons produits
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


def _pick_best_vault_doc(candidates: list[Document],
                         today: Optional[date] = None) -> Optional[Document]:
    """B1 — choix automatique d'une pièce du coffre pour une ligne de checklist.

    • jamais un document supprimé du coffre (deleted_at) ;
    • une pièce encore valable passe TOUJOURS devant une pièce expirée (l'ancien
      tri décroissant sur « 0 si valable, 1 si expirée » faisait l'inverse :
      l'expirée gagnait dès qu'une valable existait) ;
    • à validité égale : la date de fin la plus lointaine, donc une pièce datée
      devant une pièce sans date ; puis la plus récemment déposée.
    Retourne None quand aucun candidat ne reste."""
    live = [d for d in candidates if getattr(d, "deleted_at", None) is None]
    if not live:
        return None
    t = today or date.today()

    def _rang(d):
        fin = effective_expiry_date(getattr(d, "type", None), getattr(d, "expiry_date", None),
                                    getattr(d, "issued_date", None))
        return (not is_document_expired(d, t), fin or date.min,
                getattr(d, "uploaded_at", None) or datetime.min)

    return max(live, key=_rang)


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
        # Filtre org (S2.3) : borne la recherche au coffre de l'org DU PROJET.
        # Sans org résolvable → aucun candidat (fail-closed, jamais cross-org).
        org_id = (
            db.query(Project.organization_id).filter(Project.id == project_id).scalar()
            if project_id else None
        )
        candidates = (
            db.query(Document)
            .filter(
                Document.type == detected_type,
                Document.organization_id == org_id,
                Document.deleted_at.is_(None),
            )
            .all()
            if org_id else []
        )
    else:
        candidates = vault_by_type.get(detected_type, [])

    matched = _pick_best_vault_doc(candidates) if candidates else None
    if matched is not None:
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
