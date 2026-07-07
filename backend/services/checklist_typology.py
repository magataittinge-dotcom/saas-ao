"""
Typologie déterministe des pièces d'un dossier de candidature BTP (0 € API).

Chaque exigence documentaire (catégorie candidature/offre) est classée par
règles de mots-clés — mapping issu de la skill *conformite-candidature* — dans
l'un de 4 groupes métier :

  • ``fournir``   — pièce à uploader / lier au coffre-fort (attestations,
    assurances, KBIS, qualifications, références…) → matching coffre, ✓/⚠️/✗ ;
  • ``completer`` — formulaire à compléter puis signer (DC1, DC2, AE, DC4,
    déclaration sur l'honneur, attestation de visite) → flux « compléter » ;
  • ``synorix``   — produit PAR Synorix (mémoire technique) → jalon informatif,
    jamais demandé en upload ;
  • ``workflow``  — géré par un workflow dédié (DPGF/BPU/DQE) → téléchargement,
    remplissage, ré-upload (C12).

Les *non-pièces* — instructions de dépôt, format/nommage, modalités de
signature, chiffrage, contenu du mémoire (moyens/environnement/méthodo),
renvois réglementaires — sont EXCLUES et loggées : elles vivent à l'analyse et
nourrissent la génération, mais n'encombrent pas la checklist d'upload.

Priorité d'évaluation : la première règle qui matche gagne. L'ordre encode le
métier — les non-pièces « fortes » d'abord, puis les formulaires, le workflow,
le mémoire, les pièces du coffre, enfin les exclusions « faibles » de contenu
(atteintes seulement si aucune pièce concrète n'a matché), et par défaut le
groupe ``fournir`` avec libellé brut (jamais perdu).
"""
from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

DOCUMENT_GROUPS = ("fournir", "completer", "synorix", "workflow")


@dataclass
class Classification:
    group: Optional[str]          # 'fournir'|'completer'|'synorix'|'workflow' ou None si exclu
    canonical_type: str           # type de pièce physique (clé de consolidation)
    label: str                    # libellé métier lisible
    excluded: bool = False
    exclude_reason: str = ""


# Une règle = (action, canonical_type, label_ou_raison, [mots-clés]).
#   action ∈ {"exclude", "fournir", "completer", "synorix", "workflow"}
# ÉVALUÉES DANS L'ORDRE — la première qui matche gagne.
_RULES: list[tuple[str, str, str, list[str]]] = [

    # ── 1. NON-PIÈCES « fortes » (aucune pièce nommée) ──────────────────────
    ("exclude", "depot", "Modalité de dépôt / transmission (procédural)", [
        "avant la date et heure limites", "transmettre la candidature et l'offre avant",
        "voie dematerialisee", "voie dématérialisée", "deposer l'offre", "déposer l'offre",
        "plateforme", "profil acheteur", "achatpublic", "copie de sauvegarde", "cle usb",
        "clé usb", "demande de renseignements", "adresser toute demande",
    ]),
    ("exclude", "format", "Format / nommage / sécurité du fichier (procédural)", [
        "formats acceptes", "formats acceptés", "formats de fichiers", "format non conforme",
        "nommer les dossiers", "convention de nommage", "anti-virus", "antivirus",
        "chiffrement de l'offre", "assurer le chiffrement",
    ]),
    ("exclude", "signature", "Modalité de signature (procédural)", [
        "signer les candidatures et offres", "certificat de signature",
        "signature electronique avancee", "signature électronique avancée",
        "signature manuscrite scannee", "signature manuscrite scannée",
    ]),
    ("exclude", "chiffrage", "Chiffrage / prix (hors périmètre Synorix)", [
        "chiffrer", "prestations supplementaires eventuelles", "prestations supplémentaires éventuelles",
        "(pse)", "sous-detail", "sous-détail", "sous detail des prix",
    ]),
    ("exclude", "reglementaire", "Renvoi réglementaire générique", [
        "articles r.2143-6", "r.2143-6 et suivants", "pieces prevues aux articles",
        "pièces prévues aux articles",
    ]),
    ("exclude", "variante", "Variante (conditionnel, hors checklist)", [
        "en cas de variante", "presenter la variante", "présenter la variante",
    ]),
    ("exclude", "memoire_content", "Contenu à intégrer au mémoire (nourrit la génération)", [
        "integrer dans le memoire", "intégrer dans le mémoire", "dans le memoire technique un tableau",
        "dans le mémoire technique un tableau", "dans le memoire technique les cv",
        "dans le mémoire technique les cv",
    ]),

    # ── 2. FORMULAIRES à compléter/signer ───────────────────────────────────
    ("completer", "attestation_visite", "Attestation de visite du site",
        ["visite des lieux", "visite du site", "attestation de visite", "visite obligatoire"]),
    ("completer", "dc1", "DC1 — Lettre de candidature",
        ["dc1", "lettre de candidature"]),
    ("completer", "dc2", "DC2 — Déclaration du candidat",
        ["dc2", "declaration du candidat", "déclaration du candidat"]),
    ("completer", "dc4", "DC4 — Déclaration de sous-traitance",
        ["dc4", "declaration de sous-traitance", "déclaration de sous-traitance",
         "declarations de sous-traitance", "déclarations de sous-traitance"]),
    ("completer", "declaration_honneur", "Déclaration sur l'honneur",
        ["declaration sur l'honneur", "déclaration sur l'honneur"]),
    ("completer", "acte_engagement", "Acte d'engagement (AE)",
        ["acte d'engagement", "acte d engagement", "ae/attri", "attri1",
         "cadre d'acte d'engagement", "ae valant"]),

    # ── 3. WORKFLOW dédié (DPGF/BPU/DQE) ────────────────────────────────────
    ("workflow", "dpgf", "DPGF — Décomposition du prix global et forfaitaire",
        ["dpgf", "decomposition du prix global", "décomposition du prix global"]),
    ("workflow", "bpu", "BPU — Bordereau des prix unitaires",
        ["bpu", "bordereau des prix"]),
    ("workflow", "dqe", "DQE — Détail quantitatif estimatif",
        ["dqe", "detail quantitatif", "détail quantitatif"]),

    # ── 4. PRODUIT PAR SYNORIX (jalon) ──────────────────────────────────────
    ("synorix", "memoire_technique", "Mémoire technique",
        ["memoire technique", "mémoire technique", "memoire methodologique",
         "mémoire méthodologique", "memoire justificatif", "mémoire justificatif",
         "note methodologique", "note méthodologique", "remettre un memoire",
         "remettre un mémoire", "fournir un memoire", "fournir un mémoire",
         "produire un memoire", "produire un mémoire"]),
    ("synorix", "planning", "Planning prévisionnel",
        ["planning previsionnel", "planning prévisionnel", "planning d'execution",
         "planning d'exécution", "calendrier previsionnel", "calendrier prévisionnel"]),

    # ── 5. PIÈCES À FOURNIR (coffre-fort) — AVANT les exclusions faibles ─────
    ("fournir", "urssaf", "Attestation de vigilance URSSAF",
        ["urssaf", "attestation de vigilance"]),
    ("fournir", "fiscal", "Attestation de régularité fiscale",
        ["fiscale", "regularite fiscale", "régularité fiscale", "attestation fiscale",
         "dgfip", "impots", "impôts"]),
    ("fournir", "decennale", "Attestation d'assurance décennale",
        ["decennale", "décennale"]),
    ("fournir", "rc_civile", "Attestation d'assurance RC professionnelle",
        ["responsabilite civile", "responsabilité civile", "rc professionnelle", "rc pro",
         "assurance rc", "risques professionnels", "declaration appropriee de banques",
         "déclaration appropriée de banques", "preuve d'une assurance"]),
    ("fournir", "pro_btp", "Attestation Pro BTP", ["pro btp", "pro-btp"]),
    ("fournir", "cibtp", "Attestation CIBTP", ["cibtp", "ci-btp", "conges payes btp", "congés payés btp"]),
    ("fournir", "qualibat_rge", "Qualification Qualibat / RGE",
        ["qualibat", "rge", "reconnu garant", "certificats de qualification",
         "certificat de qualification", "qualifications professionnelles",
         "certificats de qualifications"]),
    ("fournir", "caces", "CACES", ["caces"]),
    ("fournir", "amiante_ss4", "Amiante sous-section 4",
        ["amiante ss4", "ss4 amiante", "amiante sous-section"]),
    ("fournir", "chiffre_affaires", "Chiffre d'affaires (3 derniers exercices)",
        ["chiffre d'affaires", "ca des", "ca global", "capacite financiere", "capacité financière"]),
    ("fournir", "effectifs", "Déclaration des effectifs",
        ["effectifs", "declaration d'effectif", "déclaration d'effectif",
         "declaration des effectifs", "déclaration des effectifs", "personnel d'encadrement"]),
    ("fournir", "attestation_travaux", "Références de travaux (5 ans) + attestations",
        ["references chantiers", "références chantiers", "references travaux", "références travaux",
         "liste des travaux", "attestations de bonne execution", "attestations de bonne exécution",
         "attestation de bonne execution", "attestation de bonne exécution", "travaux executes",
         "travaux exécutés"]),
    ("fournir", "kbis", "Extrait Kbis", ["kbis", "registre du commerce"]),
    ("fournir", "organigramme_doc", "Organigramme de l'entreprise", ["organigramme"]),
    ("fournir", "dume", "DUME", ["dume"]),
    ("fournir", "pouvoir", "Pouvoir / habilitation à signer",
        ["pouvoir", "habilitation a signer", "habilitation à signer", "habilite a signer",
         "habilité à signer", "acte d'habilitation", "habilitation du mandataire"]),
    ("fournir", "rib", "RIB", ["rib", "releve d'identite bancaire", "relevé d'identité bancaire"]),

    # ── 6. EXCLUSIONS « faibles » (contenu) — seulement si rien n'a matché ───
    ("exclude", "memoire_content", "Contenu du mémoire (moyens / environnement / méthodo)", [
        "gestion environnementale", "mesures de gestion environnementale",
        "outillage", "materiel et l'equipement", "matériel et l'équipement",
        "equipement technique", "équipement technique", "moyens materiels", "moyens matériels",
        "mode operatoire", "mode opératoire", "methodologie d'execution", "méthodologie d'exécution",
    ]),
    ("exclude", "execution_doc", "Document d'exécution (PAQ / PPSPS / SOGED)", [
        "plan d'assurance qualite", "plan d'assurance qualité", "(paq)", " paq ",
        "ppsps", "soged", "plan de retrait",
    ]),
]


def _norm(text: str) -> str:
    """Minuscule, sans accents — pour un matching de mots-clés robuste."""
    s = unicodedata.normalize("NFKD", (text or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    # espaces normalisés (les retours à la ligne du DCE cassent les mots-clés)
    return re.sub(r"\s+", " ", s)


# Les mots-clés des règles sont eux-mêmes normalisés une fois au chargement.
_NORM_RULES = [
    (action, ctype, label, [_norm(k) for k in keywords])
    for (action, ctype, label, keywords) in _RULES
]


def classify_requirement(text: str) -> Classification:
    """Classe une exigence documentaire. Jamais d'exception, jamais None inattendu."""
    norm = _norm(text)
    for action, ctype, label, keywords in _NORM_RULES:
        if any(kw in norm for kw in keywords):
            if action == "exclude":
                return Classification(group=None, canonical_type=ctype, label=label,
                                      excluded=True, exclude_reason=label)
            return Classification(group=action, canonical_type=ctype, label=label)
    # Défaut : pièce à fournir, libellé brut — jamais perdu.
    return Classification(group="fournir", canonical_type="autre", label=text.strip()[:120])


# ─────────────────────────────────────────────────────────────────────────────
#  Plan de consolidation
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ChecklistLine:
    scope: Optional[str]          # None (commun) | 'lotN'
    group: str
    canonical_type: str
    label: str
    text: str                     # exigence représentative (la plus riche)
    source_excerpt: Optional[str]
    merged_count: int = 1


@dataclass
class ExcludedItem:
    text: str
    reason: str


@dataclass
class ChecklistPlan:
    lines: list[ChecklistLine] = field(default_factory=list)
    excluded: list[ExcludedItem] = field(default_factory=list)

    def summary(self) -> str:
        by_group = {g: 0 for g in DOCUMENT_GROUPS}
        for l in self.lines:
            by_group[l.group] = by_group.get(l.group, 0) + 1
        by_reason: dict[str, int] = {}
        for e in self.excluded:
            by_reason[e.reason] = by_reason.get(e.reason, 0) + 1
        mapped = sum(l.merged_count for l in self.lines)
        parts = " ".join(f"{g}={by_group[g]}" for g in DOCUMENT_GROUPS)
        excl = " ".join(f"{r}={n}" for r, n in sorted(by_reason.items()))
        return (f"{len(self.lines)} lignes ({parts}) ; "
                f"{len(self.excluded)} exclues [{excl}] ; "
                f"réconciliation mappé({mapped})+exclu({len(self.excluded)})")


def plan_checklist(rows) -> ChecklistPlan:
    """Classe puis consolide une liste d'exigences (ComplianceItem) en lignes de
    checklist. Consolidation par (scope, type de pièce) ; non-pièces exclues.

    Deux passes pour respecter le tronc commun mutualisé : les pièces communes
    ('_commun' / legacy NULL) sont établies d'abord ; une pièce spécifique d'un
    lot **identique à une commune** est absorbée dans la ligne commune (jamais
    dupliquée par lot), conformément à la règle multi-lots.

    ``rows`` : itérable d'objets portant ``exigence_text``, ``lot``,
    ``source_excerpt``. Fonction PURE (aucune DB) — testable directement.
    """
    def _scope(r):
        return None if getattr(r, "lot", None) in (None, "_commun") else r.lot

    commun = [r for r in rows if _scope(r) is None]
    per_lot = [r for r in rows if _scope(r) is not None]

    plan = ChecklistPlan()
    index: dict[tuple, int] = {}          # (scope, canonical_type) → index dans plan.lines
    commun_index: dict[str, int] = {}     # canonical_type commun → index (pour absorption)

    def _ingest(r, scope):
        text = getattr(r, "exigence_text", "") or ""
        excerpt = getattr(r, "source_excerpt", None)
        cls = classify_requirement(text)

        if cls.excluded:
            plan.excluded.append(ExcludedItem(text=text, reason=cls.exclude_reason))
            return

        ctype = cls.canonical_type
        # Une pièce par lot identique à une commune est absorbée (pas de doublon).
        if scope is not None and ctype != "autre" and ctype in commun_index:
            plan.lines[commun_index[ctype]].merged_count += 1
            return

        key = (scope, ctype)
        # 'autre' n'est jamais fusionné (chaque pièce inconnue garde sa ligne).
        if ctype != "autre" and key in index:
            line = plan.lines[index[key]]
            line.merged_count += 1
            if not line.source_excerpt and excerpt:
                line.source_excerpt = excerpt
            return

        line = ChecklistLine(
            scope=scope, group=cls.group, canonical_type=ctype,
            label=cls.label, text=text, source_excerpt=excerpt,
        )
        if ctype != "autre":
            index[key] = len(plan.lines)
            if scope is None:
                commun_index[ctype] = len(plan.lines)
        plan.lines.append(line)

    for r in commun:
        _ingest(r, None)
    for r in per_lot:
        _ingest(r, _scope(r))

    return plan
