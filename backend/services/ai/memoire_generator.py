"""Génération du mémoire technique — composition long-form par segments.

Génère le mémoire (~20 pages) en plusieurs segments (préambule, parties A/B/C) via
Claude. Configuration prod = full-Sonnet 5.5 (`_MEMOIRE_SEGMENT_MODELS`, forçable par `MEMOIRE_MODELE`) ; Opus 4.7
reste en fallback. Le préambule part seul (il écrit le prompt cache), les parties
A, B et C ensuite en parallèle (elles le relisent) — même schéma que l'analyse.
La densité normative vient du PROMPT + corpus skills, mais un DTU n'est cité que s'il est dans le CCTP du lot ou dans un article du lot des pièces communes (dtu_autorises.py, regle_dtu : même règle que la réécriture de paragraphe : liste dans le prompt + garde-fou après génération).
"""
import json
import asyncio
import threading
import time
import anthropic
from json_repair import repair_json
from config import get_settings
from .prompts import MEMOIRE_GENERATION_SYSTEM
from services.skill_loader import load_skill, load_skills_bundle, load_skill_reference
from models.project import TYPE_AE, TYPES_GRILLES_DE_PRIX
from services.ai.dtu_autorises import formater_liste_dtu, regle_dtu  # noqa: F401  (formater_liste_dtu ré-exporté)
from services.dpgf_ouvrages import est_tableur
import logging

logger = logging.getLogger(__name__)
settings = get_settings()


def _safe_update_progress(project_id: str, ratio: float) -> None:
    """Best-effort publish of a real progress signal. Never raises so
    pipeline_tracker / progress_bus failures can't break the AI call."""
    try:
        from services import pipeline_tracker
        pipeline_tracker.update_step_progress(project_id, ratio)
    except Exception:
        pass


class _AvancementSegments:
    """Avancement d'ensemble quand plusieurs parties s'écrivent en même temps.

    Chaque partie pèse sa taille attendue ; sa fraction ne fait que monter, donc
    l'ensemble aussi (de 2 % à 99 %), quel que soit l'ordre des threads."""

    def __init__(self, project_id: str | None, poids: list[int]):
        self._project_id = project_id
        self._poids = poids
        self._fait = [0.0] * len(poids)
        self._verrou = threading.Lock()

    def rappel(self, i: int):
        def maj(local: float) -> None:
            with self._verrou:
                self._fait[i] = max(self._fait[i], min(local, 1.0))
                total = sum(p * f for p, f in zip(self._poids, self._fait)) / sum(self._poids)
            if self._project_id:
                _safe_update_progress(self._project_id, min(0.02 + total * 0.96, 0.99))
        return maj


def _poids_segment(segment_subkeys: list[str] | None) -> int:
    """Taille attendue d'une partie, en caractères (sert à l'avancement)."""
    return 4000 if segment_subkeys is None else max(len(segment_subkeys), 1) * 6000


_DETAIL_INSTRUCTION = "Génère un mémoire technique COMPLET et DÉTAILLÉ de 20 à 25 pages. Chaque section doit être exhaustive."

# Skills always loaded for mémoire generation
_ALWAYS_LOAD_MEMOIRE = ["memoire-technique-expert", "scoring-offres-expert", "redaction-gagnante-btp"]

# ── Découpage de la sortie en appels (un par "partie") ──────────────────────
# Un mémoire complet = 26 sous-sections, ce qui dépasse le max de tokens de
# sortie du modèle en un seul appel → troncature. On génère une partie par
# appel ; le contexte stable (système + skills + méthodo + profil + DCE) est
# identique sur les 4 appels et mis en cache (TTL 5 min) → surcoût ≈ sortie.
# Le 1er segment part seul et écrit le cache ; les suivants partent ensemble.
# preambule est une chaîne ; partie_* sont des objets avec ces sous-sections
# (ordre et clés EXACTEMENT alignés sur prompts.py / le contrat de sortie).
_MEMOIRE_SEGMENTS: list[tuple[str, list[str] | None]] = [
    ("preambule", None),
    ("partie_a", [
        "implantation", "historique", "engagement_qualitatif", "activites",
        "organigramme", "roles_missions", "moyens_informatiques", "vehicules",
        "materiel", "references", "fournisseurs",
    ]),
    ("partie_b", [
        "demarrage", "interlocuteur", "qualite_ouvrages", "respect_planning",
        "securite", "dechets", "environnement",
    ]),
    ("partie_c", [
        "methodologie", "effectifs", "materiels", "hygiene_securite",
        "mesures_environnementales", "gpa", "delai",
    ]),
]

# ── Modèle PAR segment (génération hybride, configurable) ───────────────────
_MEMOIRE_MODEL_OPUS = "claude-opus-4-7"
_MEMOIRE_MODEL_SONNET = "claude-sonnet-5-5"

# Mapping centralisé : réajuster un segment ICI suffit, la logique de génération
# ne change pas. Full-Sonnet 5.5 (décision du 26/10) : sur le DCE Gueux, passage
# payant n° 1 — 0,974 $ contre 1,105 $ en Sonnet 4.6, 181,5 s contre ≈ 480 s, mémoire
# complet et sans placeholder ; Opus 4.7 coûtait ~7× plus (6,71 $, cf.
# docs/comparaison-memoire-AB/RESULTAT.md). Sonnet 5.x réfléchit par défaut : la
# réflexion est coupée par `between_tools` (voir _sync_call_segment). La densité
# normative est récupérée par le PROMPT (prompts.py) ; les DTU citables sont
# bornés par la liste autorisée (dtu_autorises.py). Fallback = self.MODEL.
# `MEMOIRE_MODELE` (env) force un autre modèle unique pour les 4 parties (ex.
# « claude-sonnet-4-6 » pour revenir à l'ancien réglage).
# ⚠️ CACHE : le préfixe stable est caché PAR MODÈLE. Tous les segments sur le même
# modèle → 1 seul cache_write puis cache_read sur les 3 suivants (optimal). Si un
# jour un segment change de modèle, le garder CONSÉCUTIF aux autres du même modèle.
_MEMOIRE_SEGMENT_MODELS: dict[str, str] = {
    "preambule": _MEMOIRE_MODEL_SONNET,
    "partie_a": _MEMOIRE_MODEL_SONNET,
    "partie_b": _MEMOIRE_MODEL_SONNET,
    "partie_c": _MEMOIRE_MODEL_SONNET,
}


def _build_segment_instruction(key: str, subkeys: list[str] | None) -> str:
    """Instruction (non cachée) qui scope CET appel à une seule partie.

    Placée en dernier dans le message user, elle prime sur le schéma global du
    prompt système (qui reste en cache) sans le modifier."""
    if subkeys is None:
        return (
            "\n\n━━━ CONSIGNE DE CET APPEL (IMPÉRATIVE) ━━━\n"
            "Le mémoire est généré EN PLUSIEURS APPELS. Pour CET appel, génère "
            "UNIQUEMENT le préambule.\n"
            'Réponds avec un objet JSON STRICT contenant EXACTEMENT cette unique '
            'clé : {"preambule": "markdown..."} — et RIEN d\'autre. Ne génère '
            "aucune autre partie. Ta réponse commence par { et finit par }."
        )
    subs = "\n".join(f"  - {s}" for s in subkeys)
    return (
        "\n\n━━━ CONSIGNE DE CET APPEL (IMPÉRATIVE) ━━━\n"
        "Le mémoire est généré EN PLUSIEURS APPELS. Pour CET appel, génère "
        f"UNIQUEMENT la partie « {key} ».\n"
        f'Réponds avec un objet JSON STRICT contenant EXACTEMENT l\'unique clé de '
        f'premier niveau "{key}", dont la valeur est un objet avec ces '
        "sous-sections (TOUTES obligatoires, valeurs en markdown détaillé et "
        "spécifique au marché) :\n"
        f"{subs}\n"
        "Ne génère AUCUNE autre partie (ni preambule, ni les autres partie_*). "
        f'Format attendu : {{"{key}": {{"<sous_section>": "markdown...", ...}}}}. '
        "Ta réponse commence par { et finit par }."
    )


def _build_memoire_skills(has_references: bool) -> tuple[str, list[str]]:
    """Build mémoire skills supplement per-call.

    Only loads references-intelligentes when the enterprise has references.
    Returns (combined_text, list_of_skill_names_loaded).
    """
    skill_names = list(_ALWAYS_LOAD_MEMOIRE)
    if has_references:
        skill_names.append("references-intelligentes")

    combined = load_skills_bundle(skill_names)
    total_chars = len(combined)
    logger.info(f"Skills chargés : {skill_names} — {total_chars:,} chars")
    print(f"[Memoire Generator] Skills chargés : {skill_names} — {total_chars:,} chars", flush=True)
    return combined, skill_names

# ── Mapping corps de métier → fichier référence méthodologie ──────────────
_METHODOLOGY_SKILL = "methodologie-par-corps-de-metier"

_CORPS_METIER_KEYWORDS: list[tuple[list[str], str]] = [
    (["façade", "facade", "ite", "ravalement", "bardage", "enduit ext", "isolation ext"],
     "01-facades-ite-ravalement.md"),
    (["gros œuvre", "gros oeuvre", "maçonnerie", "maconnerie", "béton", "beton", "fondation", "structure"],
     "02-gros-oeuvre-maconnerie.md"),
    (["peinture", "revêtement", "revetement", "sol souple", "papier peint", "enduit int"],
     "03-peinture-revetements.md"),
    (["électricité", "electricite", "electricité", "electrique", "électrique", "courant", "cfo", "cfa"],
     "04-electricite.md"),
    (["vrd", "voirie", "assainissement", "réseaux divers", "enrobé", "enrobe", "terrassement"],
     "05-vrd.md"),
    (["plomberie", "cvc", "chauffage", "ventilation", "climatisation", "sanitaire", "ecs"],
     "06-plomberie-cvc.md"),
    (["étanchéité", "etancheite", "couverture", "toiture", "terrasse", "charpente"],
     "07-etancheite-couverture.md"),
    (["menuiserie", "fenêtre", "fenetre", "porte ext", "baie", "volet", "fermeture"],
     "08-menuiseries-exterieures.md"),
]


_ORDRE_CATEGORIES_EXIGENCES = {
    "technique": 0, "planning": 1, "offre": 2, "criteres_notation": 3, "candidature": 4,
}


def _exigences_compactes(compliance_items: list) -> str:
    """Toutes les exigences remises, sous un titre par catégorie (plus de préfixe
    « [TECHNIQUE] » répété sur chaque ligne). Catégories dans l'ordre utile au
    mémoire, ordre d'origine conservé à l'intérieur (tri stable). Une exigence
    tient sur une ligne ; « (souhaitée) » seulement quand elle ne l'est pas
    obligatoirement. Chaîne vide s'il n'y en a aucune."""
    triees = sorted(
        compliance_items,
        key=lambda c: _ORDRE_CATEGORIES_EXIGENCES.get(c.category, 5),
    )
    groupes: dict[str, list[str]] = {}
    for item in triees:
        texte = " ".join((item.exigence_text or "").split())
        if not texte:
            continue
        if getattr(item, "priority", None) == "souhaitée":
            texte += " (souhaitée)"
        groupes.setdefault(item.category or "autre", []).append(f"- {texte}")
    blocs = [
        f"{cat.upper()} ({len(lignes)})\n" + "\n".join(lignes)
        for cat, lignes in groupes.items()
    ]
    return "\n\n".join(blocs)


def _rank_references_for_lot(references: list, selected_lot_name: str | None) -> list:
    """Sort references so the ones matching the lot's corps de métier come first.

    A candidate offering façade ITE ought to push its 3 façade references on top,
    not its 12 best-paid plumbing jobs. We bucket references in 3 tiers:
      • TIER 1: lot keywords match the reference's `lot` field
      • TIER 2: same broad family (gros œuvre / second œuvre / VRD …)
      • TIER 3: rest
    Within each tier we sort by year desc, then montant_ht desc.
    """
    if not references:
        return []
    if not selected_lot_name:
        return sorted(
            references,
            key=lambda r: (r.annee or 0, r.montant_ht or 0),
            reverse=True,
        )

    lot_lower = selected_lot_name.lower()
    matched_keywords: list[str] = []
    for keywords, _file in _CORPS_METIER_KEYWORDS:
        if any(kw in lot_lower for kw in keywords):
            matched_keywords = keywords
            break

    tier1, tier2, tier3 = [], [], []
    for r in references:
        ref_lot = (r.lot or "").lower()
        if matched_keywords and any(kw in ref_lot for kw in matched_keywords):
            tier1.append(r)
        elif matched_keywords and any(kw in (r.intitule or "").lower() for kw in matched_keywords):
            tier2.append(r)
        else:
            tier3.append(r)

    def _sort_key(r):
        return (r.annee or 0, r.montant_ht or 0)

    tier1.sort(key=_sort_key, reverse=True)
    tier2.sort(key=_sort_key, reverse=True)
    tier3.sort(key=_sort_key, reverse=True)
    print(
        f"[Memoire Generator] References ranked for lot '{selected_lot_name}': "
        f"tier1={len(tier1)} (lot match), tier2={len(tier2)} (intitule match), "
        f"tier3={len(tier3)} (other)",
        flush=True,
    )
    return tier1 + tier2 + tier3


def _load_methodology_reference(selected_lot_name: str | None) -> str:
    """Load the BTP methodology reference matching the lot's corps de métier.

    Returns the combined text of the matching reference file + the transversal
    data (autocontrôles, conditions météo, sécurité). Returns empty string if
    no match or files not found.
    """
    if not selected_lot_name:
        return ""

    lot_lower = selected_lot_name.lower()

    # Find matching reference file
    matched_file: str | None = None
    for keywords, filename in _CORPS_METIER_KEYWORDS:
        if any(kw in lot_lower for kw in keywords):
            matched_file = filename
            break

    if not matched_file:
        return ""

    parts: list[str] = []

    # Load specific corps de métier reference via skill_loader
    content = load_skill_reference(_METHODOLOGY_SKILL, matched_file)
    if content:
        parts.append(content)

    # Load transversal data (autocontrôles, météo, sécurité, déchets)
    transversal = load_skill_reference(_METHODOLOGY_SKILL, "00-transversal.md")
    if transversal:
        parts.append(transversal)

    if not parts:
        return ""

    print(f"[Memoire Generator] Référentiel méthodologie chargé: {matched_file} + 00-transversal.md", flush=True)
    return "\n\n".join(parts)


def _append_reglementaire(dynamic_block: str, reglementaire_block: str | None) -> str:
    """Lot 7 T3 — bloc réglementaire (RAG_ENRICHMENT). None/vide → le prompt
    est retourné STRICTEMENT inchangé (identique à l'octet, testé)."""
    if not reglementaire_block:
        return dynamic_block
    return (
        dynamic_block
        + "\n\n━━━ RÉFÉRENCES RÉGLEMENTAIRES (Code de la commande publique) ━━━\n"
        + reglementaire_block
    )


# ── Extraits du DCE envoyés au mémoire (B2) ──────────────────────────────────
# Décision de Mohamed (25/10/2026) : jamais le tableur brut à l'IA, jamais une
# colonne de prix ou de montant ; la DPGF chiffrée par l'entreprise ne part
# jamais. La DPGF n'entre donc que par la liste de ses ouvrages (lue sans IA,
# services/dpgf_ouvrages.py), à la place qu'avait son texte brut.
_PRIORITE_DCE = {"cctp": 0, "rc": 1, TYPE_AE: 2, "plan": 4}   # CCTP d'abord : la méthodologie
_PRIORITE_OUVRAGES = 3
_MAX_DCE_CHARS = 90_000
_MAX_PAR_PIECE = {"rc": 8_000, "cctp": 55_000}
_MAX_AUTRE_PIECE = 5_000
_MAX_OUVRAGES = 15_000


def texte_dce_pour_memoire(all_docs: list, ouvrages_dpgf: str | None = None) -> str:
    """Extraits du DCE pour le prompt du mémoire, par priorité et dans un budget.

    Jamais : une grille de prix (DPGF, BPU, DQE), un tableur, une pièce remplie
    par l'entreprise."""
    entrees = []   # (priorité, rang, en-tête, texte, plafond)
    for rang, doc in enumerate(all_docs):
        type_ = doc.type or "autre"
        if (not doc.extracted_text or getattr(doc, "is_user_completed", False)
                or type_ in TYPES_GRILLES_DE_PRIX or est_tableur(doc.file_name)):
            continue
        libelle = type_.upper() if type_ != "autre" else "DOCUMENT"
        entrees.append((_PRIORITE_DCE.get(type_, 5), rang, f"=== {libelle} — {doc.file_name} ===\n",
                        doc.extracted_text, _MAX_PAR_PIECE.get(type_, _MAX_AUTRE_PIECE)))
    if ouvrages_dpgf:
        entrees.append((_PRIORITE_OUVRAGES, -1, "", ouvrages_dpgf, _MAX_OUVRAGES))
    entrees.sort(key=lambda e: (e[0], e[1]))

    parts, total = [], 0
    for _priorite, _rang, entete, texte, plafond in entrees:
        reste = _MAX_DCE_CHARS - total
        if reste <= 0:
            break
        extrait = texte[:min(plafond, reste)]
        parts.append(entete + extrait)
        total += len(extrait)
    return "\n\n".join(parts)


class MemoireGenerator:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    # Latest Opus is the right tool for memoire generation (long-form,
    # high-stakes, structured). Sonnet is reserved for extraction/matching.
    MODEL = "claude-opus-4-7"

    async def generate(
        self,
        organization,           # Organization ORM object
        memoire_config,         # MemoireConfig ORM object or None
        project_name: str,
        maitre_ouvrage: str,
        selected_lot_name: str,  # e.g. "Lot 05 — Revêtement de Façade + ITE"
        all_docs: list,         # list of ProjectDocument objects
        compliance_items: list, # list of ComplianceItem objects
        references: list,       # list of Reference objects
        variables: dict,
        criteres_jugement: list | None = None,
        reference_template_text: str | None = None,  # text from imported mémoire
        project_id: str | None = None,
        profile_overrides: dict | None = None,  # C9a — overrides locaux du pre-flight
        reglementaire_block: str | None = None,  # Lot 7 T3 — RAG_ENRICHMENT
        ouvrages_dpgf: str | None = None,  # B2 — ouvrages du lot, lus sans IA dans la DPGF
        selected_lot: str | None = None,   # « lot5 » : sert au rattachement des articles du lot 00
        lots_detectes: list | None = None,  # lots du projet [{id, nom}] (désignations des autres lots)
    ) -> dict:
        """Generate a complete mémoire technique using Claude Opus.

        Cost optimisation — prompt caching: the *stable* parts of every call
        (system prompt, BTP skills, methodology references, company profile,
        chantiers references) are tagged with `cache_control=ephemeral` so
        Anthropic only bills the cached-read price (~10 % of the input price)
        on subsequent calls within the 5 min TTL.

        Result on a typical mémoire:
          • 1st generation of an org : full price (~80k input tokens)
          • subsequent generations : ~70k tokens cached (90 % discount) +
            ~10k uncached → ~5x cost reduction.
        """

        # ── 1. Company profile ────────────────────────────────────────────────
        cfg = memoire_config
        company_block = {
            "nom": (cfg.nom_entreprise if cfg and cfg.nom_entreprise else organization.name),
            "siret": organization.siret,
            "adresse": organization.address,
        }

        if cfg:
            company_block.update({
                "date_creation": cfg.date_creation,
                "gerant_nom": cfg.gerant_nom,
                "gerant_titre": cfg.gerant_titre,
                "zone_intervention": cfg.zone_intervention,
                "historique": cfg.historique or organization.historique,
                "activites": cfg.activites or organization.activites,
                "chiffre_affaires": cfg.chiffre_affaires,
                "organigramme_description": cfg.organigramme_description or organization.organigramme,
                "postes_cles": cfg.postes_cles,
                "moyens_informatiques": cfg.moyens_informatiques or organization.moyens_informatiques,
                "vehicules": cfg.vehicules or organization.vehicules,
                "materiel": cfg.materiel or organization.materiel,
                "demarche_qualite": cfg.demarche_qualite,
                "procedure_demarrage": cfg.procedure_demarrage,
                "gestion_securite": cfg.gestion_securite,
                "traitement_dechets": cfg.traitement_dechets,
                "mesures_environnementales": cfg.mesures_environnementales,
                "fournisseurs": cfg.fournisseurs_principaux or organization.fournisseurs,
            })
        else:
            company_block.update({
                "historique": organization.historique,
                "activites": organization.activites,
                "organigramme_description": organization.organigramme,
                "moyens_informatiques": organization.moyens_informatiques,
                "vehicules": organization.vehicules,
                "materiel": organization.materiel,
                "fournisseurs": organization.fournisseurs,
            })

        # C9a — couche override du pre-flight : prime sur cfg et organization,
        # LOCALE à ce mémoire (le profil org n'est jamais modifié ici).
        if profile_overrides:
            company_block.update({
                k: v for k, v in profile_overrides.items() if v is not None
            })

        # ── 2. References — sorted by relevance to the lot, then by year ──────
        # The acheteur public scores higher when a candidate proves it has done
        # similar projects. Façade reference for a façade lot beats a generic
        # one by year alone. We do NOT drop unrelated references — Claude will
        # still see them as fallbacks — but we put the matching ones first.
        sorted_refs = _rank_references_for_lot(references, selected_lot_name)
        ref_list = [
            {
                "intitule": r.intitule,
                "maitre_ouvrage": r.maitre_ouvrage,
                "lot": r.lot,
                "montant_ht": r.montant_ht,
                "annee": r.annee,
                "description": getattr(r, "description", None),
            }
            for r in sorted_refs[:35]
        ]

        # ── 3. DCE text (priority: CCTP first — critical for méthodologie) ─────
        dce_text = texte_dce_pour_memoire(all_docs, ouvrages_dpgf)

        # ── 4. Compliance summary ─────────────────────────────────────────────
        # Toutes les exigences du lot (le routeur fournit communes + propres au
        # lot) : plus de plafond à 80. Forme compacte, voir _exigences_compactes.
        compliance_summary = _exigences_compactes(compliance_items)

        # ── 5. Critères de jugement block ─────────────────────────────────────
        criteres_block = ""
        if criteres_jugement:
            lines = ["CRITÈRES D'ÉVALUATION DES OFFRES (pondérations réelles du RC) :"]
            for c in criteres_jugement:
                lines.append(f"- {c['nom']} : {c['poids']}%")
                for sc in c.get("sous_criteres", []):
                    lines.append(f"    • {sc['nom']} : {sc['poids']}%")
            tech = next((c for c in criteres_jugement if c["poids"] >= 40 and c.get("sous_criteres")), None)
            if tech:
                top_sc = max(tech["sous_criteres"], key=lambda x: x["poids"], default=None)
                if top_sc:
                    lines.append(f"\n⚡ INSISTE PARTICULIÈREMENT sur '{top_sc['nom']}' ({top_sc['poids']}%) — c'est le sous-critère le mieux pondéré.")
            criteres_block = "\n".join(lines)

        # ── 6. Build STABLE blocks (cached) — same across all calls of an org ─
        methodology_ref = _load_methodology_reference(selected_lot_name)
        memoire_skills, _ = _build_memoire_skills(has_references=len(references) > 0)

        # Each big stable text becomes its own block with cache_control on the
        # last one of the group (Anthropic caches the prefix up to that block).
        stable_skills_block = ""
        if memoire_skills:
            stable_skills_block += (
                "━━━ RÉFÉRENTIELS COMPLÉMENTAIRES (expertise mémoire BTP) ━━━\n"
                "Expertise complémentaire sur la notation des offres et les techniques "
                "de rédaction gagnantes. Utilise ces conseils pour maximiser la note.\n\n"
                f"{memoire_skills}\n\n"
            )
        if methodology_ref:
            stable_skills_block += (
                "━━━ RÉFÉRENTIEL MÉTHODOLOGIE BTP (corps de métier détecté depuis le lot) ━━━\n"
                "Utilise ce référentiel technique comme base pour rédiger la PARTIE C (méthodologie). "
                "Il contient les tolérances, les étapes détaillées, les autocontrôles et les "
                "erreurs fréquentes du corps de métier ; les numéros de DTU qu'il mentionne "
                "ne sont citables que s'ils figurent dans la LISTE DES DTU AUTORISÉS du message. "
                "ADAPTE ce contenu au CCTP spécifique du marché — ne recopie pas tel quel.\n\n"
                f"{methodology_ref}\n\n"
            )

        org_block_text = (
            "━━━ PROFIL ENTREPRISE (memoire_config) ━━━\n"
            f"{json.dumps(company_block, ensure_ascii=False, indent=2)}\n\n"
            "━━━ RÉFÉRENCES CHANTIERS ━━━\n"
            f"{json.dumps(ref_list, ensure_ascii=False, indent=2)}\n"
        )

        # ── 7. Build DYNAMIC block (uncached — varies per AO) ────────────────
        # DTU autorisés : lus sans IA dans le CCTP du lot et les pièces communes.
        # Dans le bloc VARIABLE, jamais dans le préfixe stable (cache par modèle).
        # Pièces du lot 00 : seuls les articles rattachés au lot comptent (décision du 27/10).
        # Même règle que la réécriture de paragraphe (regle_dtu, décision du 27/10).
        regle = regle_dtu(all_docs, selected_lot, selected_lot_name,
                          lots_detectes=lots_detectes, deja_filtre=True)
        liste_dtu = regle.consigne()
        dynamic_block = (
            f"MARCHÉ : {project_name}\n"
            f"MAÎTRE D'OUVRAGE : {maitre_ouvrage or 'Non renseigné'}\n"
            f"TYPE DE LOT : {selected_lot_name or 'Non renseigné'}\n\n"
            f"CONSIGNE LONGUEUR : {_DETAIL_INSTRUCTION}\n\n"
            f"━━━ VARIABLES CHANTIER ━━━\n"
            f"{json.dumps(variables, ensure_ascii=False, indent=2)}\n\n"
            + (f"━━━ CRITÈRES DE JUGEMENT ━━━\n{criteres_block}\n\n" if criteres_block else "")
            + (f"━━━ EXIGENCES DCE (compliance matrix) ━━━\n{compliance_summary}\n\n" if compliance_summary else "")
            + f"{liste_dtu}\n\n"
            + f"━━━ DOCUMENTS DCE ━━━\n{dce_text}"
        )

        if reference_template_text:
            dynamic_block += (
                "\n\n━━━ MÉMOIRE DE RÉFÉRENCE (style et structure à reproduire) ━━━\n"
                "Voici un extrait d'un mémoire technique précédent de l'entreprise. "
                "Adapte le style, le ton, le niveau de détail et la structure à cet exemple. "
                "Ne copie PAS le contenu — adapte uniquement le style.\n\n"
                f"{reference_template_text[:10_000]}"
            )

        # Lot 7 T3 — enrichissement réglementaire (flag RAG_ENRICHMENT).
        # None (flag off / retrieve indisponible) → prompt inchangé À L'OCTET.
        dynamic_block = _append_reglementaire(dynamic_block, reglementaire_block)

        # ── 8. Génération : le 1er segment SEUL, puis les autres EN PARALLÈLE ──
        # Évite la troncature du monobloc (26 sous-sections > max tokens de
        # sortie). Le préambule part seul : il écrit le prompt cache du préfixe
        # stable (système + skills + profil + DCE) ; les parties A, B et C
        # partent ensuite ensemble et le relisent (cache_read). Même schéma que
        # l'analyse (dce_analyzer : 1re tranche seule, puis parallèle borné à 3).
        # Durée ≈ préambule + la plus longue des parties, au lieu de la somme.
        assembled: dict = {}
        from config import get_settings
        modele_force = get_settings().MEMOIRE_MODELE.strip()
        seg_model_map = {
            k: modele_force or _MEMOIRE_SEGMENT_MODELS.get(k, self.MODEL)
            for k, _ in _MEMOIRE_SEGMENTS
        }
        meta: dict = {
            "mode": "per-partie-parallele",
            "default_model": self.MODEL,
            "models": seg_model_map,
            "segments": [],
            "warnings": [],
        }
        print(f"[Memoire Generator] Modèles par segment : {seg_model_map}", flush=True)
        avancement = _AvancementSegments(
            project_id, [_poids_segment(sub) for _, sub in _MEMOIRE_SEGMENTS])

        async def _lancer(i: int) -> tuple[dict, dict]:
            seg_key, seg_subkeys = _MEMOIRE_SEGMENTS[i]
            seg_model = seg_model_map[seg_key]
            try:
                resultat = await asyncio.to_thread(
                    self._sync_call_segment,
                    stable_skills_block,
                    org_block_text,
                    dynamic_block,
                    seg_key,
                    seg_subkeys,
                    seg_model,
                    project_id,
                    progress_cb=avancement.rappel(i),
                )
            except anthropic.AuthenticationError:
                raise
            except Exception as e:  # noqa: BLE001 — ne jamais perdre les bonnes parties
                logger.error(f"Segment '{seg_key}' échoué (placeholder conservé): {e}")
                resultat = ({}, {"segment": seg_key, "model": seg_model, "error": str(e)})
            avancement.rappel(i)(1.0)
            return resultat

        t_gen = time.monotonic()
        resultats = [await _lancer(0)]
        resultats += await asyncio.gather(*(_lancer(i) for i in range(1, len(_MEMOIRE_SEGMENTS))))
        print(f"[TIMING] Mémoire : {len(resultats)} parties en {time.monotonic() - t_gen:.1f}s "
              f"(1re seule, puis {len(resultats) - 1} en parallèle)", flush=True)

        for (seg_key, seg_subkeys), (parsed, seg_meta) in zip(_MEMOIRE_SEGMENTS, resultats):
            meta["segments"].append(seg_meta)

            if seg_subkeys is None:
                # preambule (valeur = chaîne)
                val = parsed.get("preambule") if isinstance(parsed, dict) else None
                if (not val or not str(val).strip()) and seg_meta.get("raw_fallback"):
                    val = seg_meta["raw_fallback"]
                if not val or not str(val).strip():
                    val = "[SECTION À RÉGÉNÉRER : preambule]"
                    meta["warnings"].append("preambule")
                assembled["preambule"] = val
            else:
                obj = None
                if isinstance(parsed, dict):
                    if isinstance(parsed.get(seg_key), dict):
                        obj = parsed[seg_key]
                    elif any(sk in parsed for sk in seg_subkeys):
                        obj = parsed  # le modèle a renvoyé l'objet interne directement
                obj = obj or {}
                filled: dict = {}
                for sk in seg_subkeys:
                    v = obj.get(sk)
                    if not v or not str(v).strip():
                        filled[sk] = f"[SECTION À RÉGÉNÉRER : {seg_key}.{sk}]"
                        meta["warnings"].append(f"{seg_key}.{sk}")
                    else:
                        filled[sk] = v
                assembled[seg_key] = filled

        # Garantit le contrat de sortie {preambule, partie_a, partie_b, partie_c}.
        for seg_key, seg_subkeys in _MEMOIRE_SEGMENTS:
            if seg_key not in assembled:
                assembled[seg_key] = (
                    "[SECTION À RÉGÉNÉRER : preambule]" if seg_subkeys is None else {}
                )
                meta["warnings"].append(seg_key)

        if meta["warnings"]:
            logger.warning(
                f"Mémoire généré avec {len(meta['warnings'])} section(s) à régénérer: "
                f"{meta['warnings']}"
            )
            print(
                f"[Memoire Generator] ⚠ {len(meta['warnings'])} section(s) manquante(s): "
                f"{meta['warnings']}",
                flush=True,
            )
        else:
            print("[Memoire Generator] ✅ 26/26 sous-sections générées (aucune troncature)", flush=True)

        if project_id:
            _safe_update_progress(project_id, 0.99)
        # Garde-fou déterministe : tout DTU cité hors de la liste autorisée est retiré
        # du texte (jamais remplacé par un autre). Trace = numéros seulement.
        meta["dtu"] = regle.garde_contenu(assembled)
        if meta["dtu"]["retraits"]:
            print(f"[Memoire Generator] Garde-fou DTU : {meta['dtu']['retraits']} citation(s) retirée(s) "
                  f"({', '.join(meta['dtu']['retires'])})", flush=True)
        assembled["_generation_meta"] = meta
        return assembled

    def _sync_call_segment(
        self,
        stable_skills_block: str,
        org_block_text: str,
        dynamic_block: str,
        segment_key: str,
        segment_subkeys: list[str] | None,
        model: str,
        project_id: str | None = None,
        progress_base: float = 0.0,
        progress_span: float = 1.0,
        progress_cb=None,
    ) -> tuple[dict, dict]:
        """Un appel streaming pour UNE SEULE partie du mémoire, avec `model` dédié.

        Retourne (parsed_json, seg_meta). NE LÈVE PAS sur troncature ou parse
        impossible (gracieux — l'appelant remplit des placeholders) ; ne lève
        que sur erreur d'authentification ou retries transitoires épuisés.

        Prompt caching : le préfixe stable (système + skills + profil + bloc DCE
        dynamique) est IDENTIQUE pour toutes les parties et marqué ephemeral. Le
        cache est lié AU MODÈLE : le 1er segment écrit le cache (seul), les
        segments du même modèle lancés ensuite le relisent (cache_read) ; changer de
        modèle force un nouveau write. Seule la consigne de segment varie (non cachée).
        """
        # System: prompt complet + skills (cachés). Le schéma global du prompt
        # reste en cache ; la consigne de segment (user, non cachée) le scope.
        system_blocks = [
            {"type": "text", "text": MEMOIRE_GENERATION_SYSTEM},
        ]
        if stable_skills_block:
            system_blocks.append({
                "type": "text",
                "text": stable_skills_block,
                "cache_control": {"type": "ephemeral"},
            })
        else:
            system_blocks[-1] = {
                **system_blocks[-1],
                "cache_control": {"type": "ephemeral"},
            }

        # User: org-stable + bloc DCE dynamique CACHÉS (identiques pour chaque
        # partie) ; seule la consigne de segment (dernière, non cachée) varie.
        segment_instruction = _build_segment_instruction(segment_key, segment_subkeys)
        user_content = [
            {
                "type": "text",
                "text": org_block_text,
                "cache_control": {"type": "ephemeral"},
            },
            {
                "type": "text",
                "text": dynamic_block,
                "cache_control": {"type": "ephemeral"},
            },
            {"type": "text", "text": segment_instruction},
        ]

        seg_estimate_chars = _poids_segment(segment_subkeys)

        last_error = None
        raw = ""
        seg_meta: dict = {"segment": segment_key, "model": model}
        for attempt in range(1, 4):
            t0 = time.monotonic()
            try:
                print(
                    f"[Memoire Generator] Partie '{segment_key}' — tentative {attempt}/3 "
                    f"(streaming {model}, max_tokens=32000)",
                    flush=True,
                )
                collected = ""
                last_publish = time.time()

                # temperature non transmis : déprécié pour claude-opus-4-7 (→ 400).
                # Sonnet 5.x réfléchit par défaut (`disabled` → 400) : réflexion
                # coupée par `between_tools`, comme Sonnet 4.6 qui n'en a pas.
                extra = (
                    {"extra_body": {"thinking": {"type": "between_tools"}}}
                    if model.startswith("claude-sonnet-5") else {}
                )
                with self.client.messages.stream(
                    model=model,
                    max_tokens=32000,
                    system=system_blocks,
                    messages=[{"role": "user", "content": user_content}],
                    **extra,
                ) as stream:
                    for text in stream.text_stream:
                        collected += text
                        # Progrès réel : part de la partie écrite, agrégée par
                        # l'appelant (parties parallèles) ou mappée sur sa bande.
                        if project_id or progress_cb:
                            now = time.time()
                            if now - last_publish >= 0.3:
                                local = min(len(collected) / seg_estimate_chars, 1.0)
                                if progress_cb:
                                    progress_cb(local)
                                else:
                                    _safe_update_progress(
                                        project_id,
                                        min(progress_base + local * progress_span, 0.99),
                                    )
                                last_publish = now

                final_message = stream.get_final_message()
                elapsed = time.monotonic() - t0
                stop_reason = final_message.stop_reason
                usage = getattr(final_message, "usage", None)
                cache_read = getattr(usage, "cache_read_input_tokens", 0) if usage else 0
                cache_write = getattr(usage, "cache_creation_input_tokens", 0) if usage else 0
                input_uncached = getattr(usage, "input_tokens", 0) if usage else 0
                output_tokens = getattr(usage, "output_tokens", 0) if usage else 0
                print(
                    f"[TIMING] Partie '{segment_key}' [{model}]: {elapsed:.1f}s, {len(collected)} chars, "
                    f"stop_reason={stop_reason}, in={input_uncached}, "
                    f"cache_read={cache_read}, cache_write={cache_write}, out={output_tokens}",
                    flush=True,
                )
                seg_meta.update({
                    "stop_reason": stop_reason,
                    "elapsed_s": round(elapsed, 1),
                    "chars": len(collected),
                    "input_tokens": input_uncached,
                    "cache_read": cache_read,
                    "cache_write": cache_write,
                    "output_tokens": output_tokens,
                })
                if stop_reason == "max_tokens":
                    seg_meta["truncated"] = True
                    print(
                        f"[Memoire Generator] ⚠ Partie '{segment_key}' TRONQUÉE "
                        f"(stop_reason=max_tokens) — à découper plus finement",
                        flush=True,
                    )
                raw = collected.strip()
                break

            except anthropic.AuthenticationError:
                raise
            except (anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
                elapsed = time.monotonic() - t0
                print(f"[Memoire Generator] Partie '{segment_key}' tentative {attempt} échouée après {elapsed:.1f}s: {e}", flush=True)
                last_error = e
                if attempt < 3:
                    time.sleep(3)
            except anthropic.APIStatusError as e:
                if e.status_code in (429, 500, 502, 503, 529) and attempt < 3:
                    print(f"[Memoire Generator] Partie '{segment_key}' status {e.status_code}, retry...", flush=True)
                    last_error = e
                    time.sleep(5)
                else:
                    raise
        else:
            raise Exception(f"Partie '{segment_key}' — échec après 3 tentatives. Dernière erreur: {last_error}")

        # ── Parse JSON (GRACIEUX — ne lève jamais) ────────────────────────────
        parsed: dict = {}
        start = raw.find("{")
        if start != -1:
            try:
                parsed, _ = json.JSONDecoder().raw_decode(raw, start)
            except json.JSONDecodeError:
                try:
                    repaired = repair_json(raw[start:], return_objects=True)
                    if isinstance(repaired, dict):
                        parsed = repaired
                except Exception as e:  # noqa: BLE001
                    print(f"[Memoire Generator] json_repair échec partie '{segment_key}': {e}", flush=True)
                    parsed = {}
        if not isinstance(parsed, dict):
            parsed = {}
        # preambule peut revenir en texte brut (sans JSON) → conservé en fallback.
        if segment_subkeys is None and not parsed.get("preambule"):
            if raw and not raw.lstrip().startswith("{"):
                seg_meta["raw_fallback"] = raw
        return parsed, seg_meta
