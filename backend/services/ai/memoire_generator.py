import json
import asyncio
import time
import anthropic
from json_repair import repair_json
from config import get_settings
from .prompts import MEMOIRE_GENERATION_SYSTEM
from services.skill_loader import load_skill, load_skills_bundle, load_skill_reference
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


_DETAIL_INSTRUCTION = "Génère un mémoire technique COMPLET et DÉTAILLÉ de 20 à 25 pages. Chaque section doit être exhaustive."

# Skills always loaded for mémoire generation
_ALWAYS_LOAD_MEMOIRE = ["memoire-technique-expert", "scoring-offres-expert", "redaction-gagnante-btp"]


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
        PRIORITY = {"cctp": 0, "rc": 1, "acte_engagement": 2, "dpgf": 3, "plan": 4, "autre": 5}
        docs_sorted = sorted(all_docs, key=lambda d: PRIORITY.get(d.type, 5))

        dce_parts = []
        total_chars = 0
        MAX_DCE_CHARS = 90_000
        MAX_PER_DOC = {"rc": 8_000, "cctp": 55_000}

        for doc in docs_sorted:
            if not doc.extracted_text:
                continue
            cap = MAX_PER_DOC.get(doc.type, 5_000)
            remaining = MAX_DCE_CHARS - total_chars
            if remaining <= 0:
                break
            chunk = doc.extracted_text[:min(cap, remaining)]
            label = doc.type.upper() if doc.type != "autre" else "DOCUMENT"
            dce_parts.append(f"=== {label} — {doc.file_name} ===\n{chunk}")
            total_chars += len(chunk)

        dce_text = "\n\n".join(dce_parts)

        # ── 4. Compliance summary ─────────────────────────────────────────────
        compliance_lines = [
            f"- [{item.category.upper()}] {item.exigence_text}"
            for item in compliance_items[:80]
        ]
        compliance_summary = "\n".join(compliance_lines)

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
                "Il contient les normes DTU exactes, les tolérances, les étapes détaillées, "
                "les autocontrôles et les erreurs fréquentes du corps de métier. "
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
        dynamic_block = (
            f"MARCHÉ : {project_name}\n"
            f"MAÎTRE D'OUVRAGE : {maitre_ouvrage or 'Non renseigné'}\n"
            f"TYPE DE LOT : {selected_lot_name or 'Non renseigné'}\n\n"
            f"CONSIGNE LONGUEUR : {_DETAIL_INSTRUCTION}\n\n"
            f"━━━ VARIABLES CHANTIER ━━━\n"
            f"{json.dumps(variables, ensure_ascii=False, indent=2)}\n\n"
            + (f"━━━ CRITÈRES DE JUGEMENT ━━━\n{criteres_block}\n\n" if criteres_block else "")
            + (f"━━━ EXIGENCES DCE (compliance matrix) ━━━\n{compliance_summary}\n\n" if compliance_summary else "")
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

        # ── 8. Call Opus via sync client in thread ────────────────────────────
        return await asyncio.to_thread(
            self._sync_call,
            stable_skills_block,
            org_block_text,
            dynamic_block,
            project_id,
        )

    def _sync_call(
        self,
        stable_skills_block: str,
        org_block_text: str,
        dynamic_block: str,
        project_id: str | None = None,
    ) -> dict:
        """Synchronous streaming Claude call — runs in a thread.

        Uses Anthropic prompt caching: stable blocks are cached for 5 min,
        billed at ~10 % of normal input pricing on cache hit.

        Streaming keeps the TCP connection alive (bytes every ~100 ms),
        avoiding WSL2 NAT timeout at ~185 s for long Opus generations.
        """
        # Build system as a list of blocks. The cache_control marker on the
        # last block tells Anthropic to cache everything up to (and including)
        # that block. All shared instructions across all orgs get cached here.
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

        # User message: org-stable block (cached, per-org TTL 5 min) + dynamic.
        user_content = [
            {
                "type": "text",
                "text": org_block_text,
                "cache_control": {"type": "ephemeral"},
            },
            {"type": "text", "text": dynamic_block},
        ]

        prompt_chars = (
            len(stable_skills_block) + len(org_block_text) + len(dynamic_block)
        )

        last_error = None
        for attempt in range(1, 4):
            t0 = time.monotonic()
            try:
                print(
                    f"[Memoire Generator] Tentative {attempt}/3 — streaming Opus "
                    f"({prompt_chars} chars total, "
                    f"stable={len(stable_skills_block)}, "
                    f"org={len(org_block_text)}, "
                    f"dyn={len(dynamic_block)})",
                    flush=True,
                )
                collected = ""
                last_publish = time.time()
                # Approx 3.5 chars per output token in French. max_tokens=16000
                # → typical mémoire response is 35-45k chars. Use 50k as
                # the denominator so we cap at ~99 % only when truly long.
                chars_estimate = 16000 * 3.5

                with self.client.messages.stream(
                    model=self.MODEL,
                    max_tokens=16000,
                    temperature=0,
                    system=system_blocks,
                    messages=[{"role": "user", "content": user_content}],
                ) as stream:
                    for text in stream.text_stream:
                        collected += text
                        # Real progress signal — at most 3 publishes per second
                        # so we don't spam the SSE bus on long generations.
                        if project_id:
                            now = time.time()
                            if now - last_publish >= 0.3:
                                ratio = min(len(collected) / chars_estimate, 0.99)
                                _safe_update_progress(project_id, ratio)
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
                    f"[TIMING] Memoire streaming: {elapsed:.1f}s, {len(collected)} chars, "
                    f"stop_reason={stop_reason}, "
                    f"tokens in={input_uncached}, cache_read={cache_read}, "
                    f"cache_write={cache_write}, out={output_tokens}",
                    flush=True,
                )

                if stop_reason == "max_tokens":
                    print("[Memoire Generator] ⚠ TRONQUÉ — stop_reason=max_tokens", flush=True)

                raw = collected.strip()
                break

            except anthropic.AuthenticationError:
                raise
            except (anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
                elapsed = time.monotonic() - t0
                print(f"[Memoire Generator] Tentative {attempt} échouée après {elapsed:.1f}s: {e}", flush=True)
                last_error = e
                if attempt < 3:
                    time.sleep(3)
            except anthropic.APIStatusError as e:
                if e.status_code in (429, 500, 502, 503, 529) and attempt < 3:
                    print(f"[Memoire Generator] Tentative {attempt} status {e.status_code}, retry...", flush=True)
                    last_error = e
                    time.sleep(5)
                else:
                    raise
        else:
            raise Exception(f"Échec après 3 tentatives. Dernière erreur: {last_error}")

        # ── Parse JSON ────────────────────────────────────────────────────────
        start = raw.find("{")
        if start == -1:
            raise ValueError(f"Claude n'a pas retourné de JSON valide. Début : {raw[:200]}")

        try:
            decoder = json.JSONDecoder()
            try:
                result, _ = decoder.raw_decode(raw, start)
            except json.JSONDecodeError:
                repaired = repair_json(raw[start:], return_objects=True)
                if not isinstance(repaired, dict):
                    raise ValueError("json_repair n'a pas pu reconstruire un objet valide")
                result = repaired
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f"JSON invalide dans la réponse Claude : {e}")

        required = {"preambule", "partie_a", "partie_b", "partie_c"}
        if not required.issubset(result.keys()):
            raise ValueError(f"Structure JSON incomplète. Clés : {list(result.keys())}")

        return result
