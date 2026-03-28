"""
Checklist matcher — pure Python, no AI call.
Matches candidature requirements against vault documents using keyword rules.
"""

from datetime import date


# Keyword rules: maps requirement keywords → vault document types
_TYPE_KEYWORDS: list[tuple[list[str], str]] = [
    (["dc1", "lettre de candidature"], "dc1"),
    (["dc2", "déclaration du candidat"], "dc2"),
    (["kbis", "extrait kbis", "registre du commerce"], "kbis"),
    (["urssaf", "attestation de vigilance"], "urssaf"),
    (["fiscale", "dgfip", "impôts", "attestation fiscale"], "attestation_fiscale"),
    (["décennale", "assurance décennale"], "assurance_decennale"),
    (["responsabilité civile", "rc pro", "assurance rc"], "assurance_rc"),
    (["qualibat", "certification", "qualification"], "qualification"),
    (["bilan", "chiffre d'affaires", "capacité financière"], "bilan"),
    (["références", "références chantiers", "références travaux"], "reference"),
    (["acte d'engagement", "ae "], "acte_engagement"),
    (["planning", "calendrier"], "planning"),
    (["mémoire technique", "mémoire"], "memoire_technique"),
    (["dpgf", "décomposition du prix"], "dpgf"),
    (["rib", "relevé d'identité bancaire"], "rib"),
]


def _detect_type(exigence: str) -> str | None:
    """Return the vault document type matching this requirement, or None."""
    lower = exigence.lower()
    for keywords, doc_type in _TYPE_KEYWORDS:
        if any(kw in lower for kw in keywords):
            return doc_type
    return None


def _doc_status(vault_doc) -> str:
    """Return 'présent', 'à_renouveler', or 'expiré' based on document status."""
    if vault_doc.status in ("expired", "expiré"):
        return "expiré"
    if vault_doc.status in ("expiring_soon", "à_renouveler"):
        return "à_renouveler"
    return "présent"


class ChecklistMatcher:
    async def match(self, candidature_requirements: list[dict], vault_documents: list) -> list[dict]:
        """
        Match candidature requirements against vault documents.
        Returns a checklist list without any AI API call.
        """
        # Index vault docs by type for fast lookup
        vault_by_type: dict[str, list] = {}
        for doc in vault_documents:
            t = (doc.type or "autre").lower()
            vault_by_type.setdefault(t, []).append(doc)

        checklist = []
        for req in candidature_requirements:
            exigence = req.get("exigence", "")
            detected_type = _detect_type(exigence)

            matched_doc = None
            status = "manquant"

            if detected_type and detected_type in vault_by_type:
                # Pick the most recent / valid document of that type
                candidates = vault_by_type[detected_type]
                # Prefer non-expired, then most recent expiry
                candidates_sorted = sorted(
                    candidates,
                    key=lambda d: (
                        0 if (d.status or "") not in ("expired", "expiré") else 1,
                        d.expiry_date or date.min,
                    ),
                    reverse=True,
                )
                matched_doc = candidates_sorted[0]
                status = _doc_status(matched_doc)

            checklist.append({
                "document_type_required": detected_type or "autre",
                "matched_document_id": str(matched_doc.id) if matched_doc else None,
                "status": status,
                "details": exigence,
                "source_in_rc": req.get("source_excerpt"),
            })

        return checklist
