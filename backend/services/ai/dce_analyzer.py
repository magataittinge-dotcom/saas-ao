"""Analyse DCE — moteur d'extraction des exigences d'un dossier de consultation.

Orchestre l'analyse IA (Sonnet 4.6) du DCE : classification des pièces, extraction
des exigences administratives/techniques/critères, détection des pièges, synthèse.
Applique le chunking anti-troncature (CCAP/CCTP entiers + dedup) pour ne pas amputer
les gros documents. Skills domaine chargés depuis `ai_skills/` via `skill_loader`.
"""
import json
import re
import asyncio
import time
import anthropic
from json_repair import repair_json
from pydantic import ValidationError
from config import get_settings
from schemas.compliance import RequirementFromAI
from .prompts import DCE_ANALYSIS_SYSTEM, DCE_PASS1_SYSTEM, DCE_PASS2_SYSTEM
from services.skill_loader import load_skill, load_skill_section
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


class ClaudeRateLimitError(Exception):
    """Raised when Anthropic's API stays rate-limited after our retries.
    The router turns this into a 503 (Service Unavailable) with Retry-After
    rather than a confusing 500."""

# ── Mapping lot keywords → DTU section headers in normes-dtu-btp ────────────
_DTU_SECTION_KEYWORDS: list[tuple[list[str], str]] = [
    (["façade", "facade", "ravalement", "bardage", "enduit ext"],
     "Façades / Ravalement"),
    (["ite", "isolation ext", "isolation thermique"],
     "Isolation thermique / ITE"),
    (["gros œuvre", "gros oeuvre", "maçonnerie", "maconnerie", "béton", "beton", "fondation", "structure"],
     "Gros œuvre / Maçonnerie"),
    (["peinture", "revêtement", "revetement", "sol souple", "papier peint", "enduit int", "carrelage"],
     "Peinture / Revêtements"),
    (["électricité", "electricite", "electricité", "electrique", "électrique", "courant", "cfo", "cfa"],
     "Électricité"),
    (["vrd", "voirie", "assainissement", "réseaux divers", "enrobé", "enrobe", "terrassement"],
     "VRD"),
    (["plomberie", "sanitaire"],
     "Plomberie / Sanitaire"),
    (["chauffage", "cvc", "ventilation", "climatisation"],
     "Chauffage / Climatisation"),
    (["étanchéité", "etancheite", "couverture", "toiture", "terrasse"],
     "Couverture"),
    (["menuiserie", "fenêtre", "fenetre", "porte ext", "baie", "volet", "fermeture"],
     "Menuiserie / Fermeture"),
    (["charpente", "bois", "ossature bois"],
     "Charpente / Structure bois"),
    (["plâtrerie", "platrerie", "cloison", "placo", "plâtre", "platre"],
     "Plâtrerie / Cloisons"),
]

# Skills always loaded for DCE analysis
_ALWAYS_LOAD_DCE = ["analyse-dce-expert", "reglementation-marches-publics", "pieges-dce-detecteur"]


def _build_dce_skills(selected_lot_name: str | None = None) -> tuple[str, list[str]]:
    """Build DCE skills supplement per-call, loading only relevant DTU sections.

    Returns (combined_text, list_of_skill_names_loaded).
    """
    skills_loaded: list[str] = []
    parts: list[str] = []

    # Always load core skills
    for name in _ALWAYS_LOAD_DCE:
        content = load_skill(name)
        if content:
            parts.append(f"━━━ RÉFÉRENTIEL : {name} ━━━\n{content}")
            skills_loaded.append(name)

    # Conditionally load normes-dtu-btp sections matching the lot
    if selected_lot_name:
        lot_lower = selected_lot_name.lower()
        dtu_sections: list[str] = []
        matched_names: list[str] = []
        seen: set[str] = set()
        for keywords, section_header in _DTU_SECTION_KEYWORDS:
            if section_header in seen:
                continue
            if any(kw in lot_lower for kw in keywords):
                section = load_skill_section("normes-dtu-btp", section_header)
                if section:
                    dtu_sections.append(section)
                    matched_names.append(section_header)
                    seen.add(section_header)

        # Always include transversal regulations when loading partial DTU
        transversal = load_skill_section("normes-dtu-btp", "Réglementation transversale")
        if transversal:
            dtu_sections.append(transversal)

        if dtu_sections:
            dtu_text = "\n\n".join(dtu_sections)
            parts.append(f"━━━ RÉFÉRENTIEL : normes-dtu-btp (sections pertinentes) ━━━\n{dtu_text}")
            skills_loaded.append(f"normes-dtu-btp[{', '.join(matched_names)}]")
        else:
            # No match found → load full DTU as fallback
            content = load_skill("normes-dtu-btp")
            if content:
                parts.append(f"━━━ RÉFÉRENTIEL : normes-dtu-btp ━━━\n{content}")
                skills_loaded.append("normes-dtu-btp")
    else:
        # No lot specified → load full DTU
        content = load_skill("normes-dtu-btp")
        if content:
            parts.append(f"━━━ RÉFÉRENTIEL : normes-dtu-btp ━━━\n{content}")
            skills_loaded.append("normes-dtu-btp")

    combined = "\n\n".join(parts)
    total_chars = len(combined)
    logger.info(f"Skills chargés : {skills_loaded} — {total_chars:,} chars")
    print(f"[DCE Analyzer] Skills chargés : {skills_loaded} — {total_chars:,} chars", flush=True)
    return combined, skills_loaded

_PLACEHOLDER_KEY = "sk-ant-placeholder"

_DEMO_CRITERES = [
    {"nom": "Prix", "poids": 60, "sous_criteres": []},
    {"nom": "Valeur technique", "poids": 40, "sous_criteres": [
        {"nom": "Méthodologie d'exécution", "poids": 20},
        {"nom": "Moyens humains et matériels", "poids": 10},
        {"nom": "Planning", "poids": 10},
    ]},
]

_DEMO_INFOS_MARCHE = {
    "objet": "Rénovation bâtiment administratif Mairie",
    "maitre_ouvrage": "Commune Test",
    "maitre_oeuvre": None,
    "lots": ["Lot unique"],
    "date_limite_reponse": None,
    "duree_marche": "8 semaines",
    "montant_estime": None,
    "type_procedure": "procédure adaptée",
}

_DEMO_REQUIREMENTS = [
    {
        "exigence": "Fournir une attestation de régularité fiscale datant de moins de 6 mois",
        "source_document": "RC", "source_page": 4,
        "source_excerpt": "Le candidat devra fournir une attestation fiscale datant de moins de 6 mois",
        "category": "candidature", "priority": "obligatoire",
    },
]

_DEMO_RESULT = {
    "requirements": _DEMO_REQUIREMENTS,
    "criteres_jugement": _DEMO_CRITERES,
    "infos_marche": _DEMO_INFOS_MARCHE,
}


# ── Chunking (Option A — corrige la troncature 30k SANS perte) ───────────────
# Taille d'une tranche envoyée au modèle. Choisie < plafond de SORTIE
# (max_tokens=16384 ≈ ~55k chars JSON) pour qu'une tranche dense ne tronque pas
# la réponse, et assez grande pour éviter un chunking inutile sur les docs courts.
_CHUNK_CHARS = 40_000
_CHUNK_OVERLAP = 1_500   # recouvrement : évite de couper une exigence à la frontière


def _split_into_chunks(text: str, max_chars: int = _CHUNK_CHARS, overlap: int = _CHUNK_OVERLAP) -> list[str]:
    """Découpe `text` en tranches <= max_chars, coupées sur une frontière propre
    (double saut de ligne > saut de ligne > espace), avec recouvrement.

    Garantit la couverture de 100 % du texte (aucun caractère perdu). Pur et
    déterministe → testé unitairement sans aucun appel API.
    """
    text = text or ""
    if len(text) <= max_chars:
        return [text] if text.strip() else []
    chunks: list[str] = []
    start, n = 0, len(text)
    while start < n:
        end = min(start + max_chars, n)
        if end < n:
            window = text[start:end]
            cut = window.rfind("\n\n")
            if cut < max_chars // 2:
                cut = window.rfind("\n")
            if cut < max_chars // 2:
                cut = window.rfind(" ")
            if cut > 0:
                end = start + cut
        piece = text[start:end]
        if piece.strip():
            chunks.append(piece)
        if end >= n:
            break
        start = max(end - overlap, start + 1)
    return chunks


def _split_segments(text: str) -> list[tuple[str, str]]:
    """Sépare un texte de passe en segments par document, en repérant les
    en-têtes '=== TYPE — fichier ==='. Retourne [(header, body), ...].

    Permet de chunker CHAQUE document séparément et de ré-injecter son en-tête
    dans chaque tranche → l'attribution source_document reste correcte même au
    milieu d'un gros document. Pur → testé unitairement.
    """
    segments: list[tuple[str, str]] = []
    cur_header, cur_body = "", []
    for ln in (text or "").split("\n"):
        stripped = ln.strip()
        if stripped.startswith("=== ") and stripped.endswith("==="):
            if cur_header or cur_body:
                segments.append((cur_header, "\n".join(cur_body)))
            cur_header, cur_body = ln, []
        else:
            cur_body.append(ln)
    if cur_header or cur_body:
        segments.append((cur_header, "\n".join(cur_body)))
    return segments


def _dedup_requirements(reqs: list[dict]) -> list[dict]:
    """Déduplique par texte d'exigence normalisé (casse/espaces), en gardant la
    première occurrence (ordre stable). Élimine les doublons nés du recouvrement
    entre tranches. Pur → testé unitairement.
    """
    seen: set[str] = set()
    out: list[dict] = []
    for r in reqs:
        if not isinstance(r, dict):
            continue
        key = re.sub(r"\s+", " ", (r.get("exigence") or "").strip().lower())
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def _build_call_texts(pass_text: str) -> list[str]:
    """Transforme le texte d'une passe en liste de textes d'appels modèle :
    chaque document est chunké, et l'en-tête du document est ré-injecté en tête
    de chaque tranche. Pur → testé unitairement.
    """
    call_texts: list[str] = []
    for header, body in _split_segments(pass_text):
        pieces = _split_into_chunks(body) or ([body] if body.strip() else [])
        for piece in pieces:
            call_texts.append(f"{header}\n{piece}" if header else piece)
    return call_texts


class DCEAnalyzer:
    def __init__(self):
        key = settings.ANTHROPIC_API_KEY
        self._demo_mode = not key or key == _PLACEHOLDER_KEY or key.startswith("sk-ant-placeholder")
        if not self._demo_mode:
            self.client = anthropic.Anthropic(
                api_key=key,
                timeout=300.0,
            )

    # ── Public API — 2-pass analysis ─────────────────────────────────────────

    async def extract_full_analysis_multi_pass(
        self,
        pass1_text: str,
        pass2_text: str | None,
        lot_header: str = "",
        selected_lot_name: str | None = None,
        on_pass1_done: callable = None,
        project_id: str | None = None,
    ) -> dict:
        """Two-pass analysis: admin docs (RC+CCAP) then technical docs (CCTP+DPGF).
        Each call is <30K chars → response <60s → no WSL2 timeout."""
        if self._demo_mode:
            return _DEMO_RESULT

        # Build skills supplement once for both passes (context-aware)
        skills_ref, _ = _build_dce_skills(selected_lot_name)

        # ── Pass 1: RC + CCAP (administrative) — chunké si volumineux ────────
        result1 = await asyncio.to_thread(
            self._run_pass_chunked, pass1_text, DCE_PASS1_SYSTEM, "passe1-admin",
            skills_ref, project_id, lot_header,
        )

        # Notify caller that pass 1 is done (for progress tracking)
        if on_pass1_done:
            on_pass1_done()

        # ── Pass 2: CCTP + DPGF (technical) — chunké si volumineux ──────────
        result2 = {"requirements": []}
        if pass2_text:
            result2 = await asyncio.to_thread(
                self._run_pass_chunked, pass2_text, DCE_PASS2_SYSTEM, "passe2-technique",
                skills_ref, project_id, lot_header,
            )

        # ── Merge results ────────────────────────────────────────────────────
        reqs = result1.get("requirements", []) + result2.get("requirements", [])
        partial = result1.get("partial_analysis") or result2.get("partial_analysis")

        if len(reqs) < 15 and len(reqs) > 0:
            logger.warning(f"Seulement {len(reqs)} exigences au total (attendu 40-80+)")
            print(f"[DCE Analyzer] ⚠ Faible nombre d'exigences total: {len(reqs)}", flush=True)

        p1_count = len(result1.get("requirements", []))
        p2_count = len(result2.get("requirements", []))
        print(
            f"[DCE Analyzer] TOTAL: {len(reqs)} exigences "
            f"(passe1: {p1_count}, passe2: {p2_count})",
            flush=True,
        )

        output = {
            "requirements": reqs,
            "criteres_jugement": result1.get("criteres_jugement", []),
            "infos_marche": result1.get("infos_marche", {}),
        }
        if partial:
            output["partial_analysis"] = True
        if len(reqs) < 15 and len(reqs) > 0:
            output["low_requirement_count"] = True
        chunks_used = (result1.get("chunked_passes") or 0) + (result2.get("chunked_passes") or 0)
        if chunks_used:
            output["analyzed_in_chunks"] = chunks_used

        return output

    # ── Pass runner with chunking (Option A) ─────────────────────────────────

    def _run_pass_chunked(
        self,
        pass_text: str,
        system_prompt: str,
        label: str,
        skills_ref: str = "",
        project_id: str | None = None,
        lot_header: str = "",
    ) -> dict:
        """Exécute une passe en découpant chaque document en tranches si besoin,
        puis FUSIONNE et DÉDUPLIQUE les exigences.

        Corrige la troncature : 100 % de chaque document est analysé, sans perte
        silencieuse. Si > 1 tranche, un avertissement est loggé et le nombre de
        tranches est remonté (`chunked_passes`). Synchrone — exécuté dans un
        thread par l'appelant (préserve le prompt caching : system + skills
        identiques sur chaque tranche → cache hit).
        """
        call_texts = _build_call_texts(pass_text)
        if not call_texts:
            return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}

        # Cas nominal : un seul appel (document(s) sous le seuil de tranche).
        if len(call_texts) == 1:
            return self._sync_call(
                lot_header + call_texts[0], system_prompt, label, skills_ref, project_id,
            )

        # Document(s) volumineux → plusieurs tranches.
        logger.warning(
            "[%s] document volumineux → analyse en %d tranches (chunking, aucune perte)",
            label, len(call_texts),
        )
        print(f"[DCE Analyzer] [{label}] CHUNKING : {len(call_texts)} tranches", flush=True)

        merged: list[dict] = []
        criteres: list = []
        infos: dict = {}
        partial = False
        for i, ct in enumerate(call_texts, 1):
            sub = self._sync_call(
                lot_header + ct, system_prompt, f"{label}-tranche{i}/{len(call_texts)}",
                skills_ref, project_id,
            )
            merged.extend(sub.get("requirements", []))
            if not criteres and sub.get("criteres_jugement"):
                criteres = sub["criteres_jugement"]
            for k, v in (sub.get("infos_marche") or {}).items():
                if v not in (None, "", []) and not infos.get(k):
                    infos[k] = v
            if sub.get("partial_analysis"):
                partial = True

        deduped = _dedup_requirements(merged)
        print(
            f"[DCE Analyzer] [{label}] fusion {len(call_texts)} tranches : "
            f"{len(merged)} exigences brutes → {len(deduped)} après dédup",
            flush=True,
        )
        result: dict = {
            "requirements": deduped,
            "criteres_jugement": criteres,
            "infos_marche": infos,
            "chunked_passes": len(call_texts),
        }
        if partial:
            result["partial_analysis"] = True
        return result

    # ── Legacy single-pass (kept for compatibility) ──────────────────────────

    async def extract_full_analysis(self, dce_text: str) -> dict:
        if self._demo_mode:
            return _DEMO_RESULT

        max_chars = 60_000
        if len(dce_text) > max_chars:
            dce_text = dce_text[:max_chars] + "\n\n[Document tronqué pour analyse]"

        skills_ref, _ = _build_dce_skills()  # no lot → full DTU
        print(f"[DCE Analyzer] Envoi à Claude (single-pass): {len(dce_text)} chars", flush=True)
        return await asyncio.to_thread(
            self._sync_call, dce_text, DCE_ANALYSIS_SYSTEM, "single-pass", skills_ref
        )

    # ── Token guard ────────────────────────────────────────────────────────

    @staticmethod
    def _guard_tokens(text: str, label: str, max_tokens: int = 150_000) -> str:
        """Log estimated tokens and truncate if over limit."""
        est = len(text) // 4
        print(f"[DCE Analyzer] {label}: ~{est:,} tokens estimés ({len(text):,} chars)", flush=True)
        max_chars = max_tokens * 4
        if len(text) > max_chars:
            logger.warning(f"[{label}] Texte trop long ({est:,} tokens), troncature à {max_tokens:,} tokens")
            print(f"[DCE Analyzer] ⚠ {label}: troncature {len(text):,} → {max_chars:,} chars", flush=True)
            text = text[:max_chars] + "\n\n[Document tronqué pour respecter la limite de tokens]"
        return text

    # ── Core sync call with retries ──────────────────────────────────────────

    def _sync_call(
        self,
        dce_text: str,
        system_prompt: str,
        label: str = "",
        skills_ref: str = "",
        project_id: str | None = None,
    ) -> dict:
        """Synchronous streaming Claude call with 3 retries — runs in a thread.

        Streaming keeps TCP alive (bytes every ~100ms), avoiding WSL2 NAT timeout.
        Prompt caching is enabled on the system prompt + skills bundle: a typical
        DCE pipeline calls this fn 3-8 times for chunks of the same archive →
        cache hit on calls 2..N saves ~90 % of system+skills input tokens.

        If ``project_id`` is set, the chars received during streaming are
        published to ``pipeline_tracker.update_step_progress`` so SSE clients
        get a real progress signal (no more elapsed-time interpolation).
        """
        # Stable system blocks (cached) — system prompt + BTP skills bundle.
        system_blocks: list[dict] = [{"type": "text", "text": system_prompt}]
        if skills_ref:
            system_blocks.append({
                "type": "text",
                "text": (
                    "━━━ RÉFÉRENTIELS COMPLÉMENTAIRES (expertise BTP) ━━━\n"
                    "Utilise ces référentiels pour enrichir ton analyse — "
                    "ils contiennent les normes DTU exactes, la réglementation "
                    "marchés publics 2026, et les bonnes pratiques d'extraction "
                    "d'exigences DCE.\n\n"
                    f"{skills_ref}"
                ),
                "cache_control": {"type": "ephemeral"},
            })
        else:
            system_blocks[-1] = {
                **system_blocks[-1],
                "cache_control": {"type": "ephemeral"},
            }

        user_content = [{
            "type": "text",
            "text": f"Voici les documents DCE à analyser :\n\n{dce_text}",
        }]
        last_error = None

        # Larger output budget: at 8000 the model truncated systematically
        # on dense DCEs (cf logs "stop_reason=max_tokens" on every pass).
        # 16384 is the safe upper bound for Sonnet 4.6 without the extended-
        # output beta header. We log a warning further down if even this
        # cap is hit so we know it's time for option B (continue-from-cut).
        _MAX_TOKENS = 16384
        # Approx 3.5 chars per output token in French → ~57k chars at full
        # 16384 budget. Used as the denominator for the streaming progress.
        chars_estimate = _MAX_TOKENS * 3.5

        for attempt in range(1, 4):
            t0 = time.monotonic()
            try:
                print(f"[DCE Analyzer] [{label}] Tentative {attempt}/3 (streaming)...", flush=True)
                collected = ""
                last_publish = time.time()

                with self.client.messages.stream(
                    model="claude-sonnet-4-6",
                    max_tokens=_MAX_TOKENS,
                    temperature=0,
                    system=system_blocks,
                    messages=[{"role": "user", "content": user_content}],
                ) as stream:
                    for text in stream.text_stream:
                        collected += text
                        # Throttled real-progress signal — at most ~3 publishes
                        # per second per ongoing stream. We only publish if a
                        # project_id was supplied (else the call is one-shot).
                        if project_id:
                            now = time.time()
                            if now - last_publish >= 0.3:
                                ratio = min(len(collected) / chars_estimate, 0.99)
                                _safe_update_progress(project_id, ratio)
                                last_publish = now

                final_message = stream.get_final_message()
                elapsed = time.monotonic() - t0
                stop_reason = final_message.stop_reason
                print(f"[TIMING] [{label}] Streaming: {elapsed:.1f}s (attempt {attempt})", flush=True)
                break

            except anthropic.AuthenticationError:
                self._demo_mode = True
                return _DEMO_RESULT
            except (anthropic.APITimeoutError, anthropic.APIConnectionError) as e:
                elapsed = time.monotonic() - t0
                print(f"[DCE Analyzer] [{label}] Tentative {attempt} échouée après {elapsed:.1f}s: {e}", flush=True)
                last_error = e
                if attempt < 3:
                    time.sleep(3)
            except anthropic.APIStatusError as e:
                last_error = e
                # 429 = input-token-per-minute rate limit (default 30k for
                # Sonnet 4.6 free tier). 5 s sleep was not enough to clear
                # the window; back off 20 s, 45 s on subsequent attempts.
                # Other transient errors keep the original 5 s backoff.
                if e.status_code == 429:
                    if attempt < 3:
                        wait = 20 if attempt == 1 else 45
                        elapsed = time.monotonic() - t0
                        print(
                            f"[DCE Analyzer] [{label}] Rate-limit 429 après {elapsed:.1f}s, "
                            f"retry dans {wait}s...",
                            flush=True,
                        )
                        time.sleep(wait)
                    # else: fall through to the for/else branch below.
                elif e.status_code in (500, 502, 503, 529) and attempt < 3:
                    elapsed = time.monotonic() - t0
                    print(f"[DCE Analyzer] [{label}] Tentative {attempt} status {e.status_code} après {elapsed:.1f}s, retry...", flush=True)
                    time.sleep(5)
                else:
                    raise Exception(f"Erreur API Claude (status {e.status_code}): {e.message}")
        else:
            # Loop completed all 3 attempts without breaking — final error.
            if isinstance(last_error, anthropic.APIStatusError) and getattr(last_error, "status_code", None) == 429:
                raise ClaudeRateLimitError(
                    f"[{label}] Limite de débit Anthropic dépassée après 3 tentatives. "
                    f"Réessayez dans une minute."
                )
            raise Exception(f"[{label}] Échec après 3 tentatives. Dernière erreur: {last_error}")

        # Check stop_reason for truncated responses
        partial = False
        if stop_reason == "max_tokens":
            logger.warning(f"[{label}] Réponse tronquée (max_tokens atteint)")
            print(f"[DCE Analyzer] [{label}] ⚠ TRONQUÉ — stop_reason=max_tokens", flush=True)
            partial = True

        raw = collected.strip()
        print(f"[DCE Analyzer] [{label}] Réponse: {len(raw)} chars, stop_reason={stop_reason}", flush=True)

        result = self._parse_json(raw)

        result["requirements"] = self._validate_requirements(
            result.get("requirements", []), label
        )
        reqs = result["requirements"]
        print(f"[DCE Analyzer] [{label}] {len(reqs)} exigences extraites", flush=True)

        if partial:
            result["partial_analysis"] = True

        return result

    @staticmethod
    def _validate_requirements(raw_reqs: list, label: str) -> list[dict]:
        """Run each requirement through RequirementFromAI.
        Invalid source_kind/expected_template_type fall back to defaults
        (vault, None). Other ValidationErrors drop the requirement and log."""
        validated: list[dict] = []
        invalid_kind = 0
        invalid_template = 0
        dropped = 0

        for raw in raw_reqs:
            if not isinstance(raw, dict):
                dropped += 1
                continue

            patched = dict(raw)

            # Pre-clean: unknown source_kind → fall back to vault
            sk = patched.get("source_kind")
            if sk not in (None, "vault", "dce_template"):
                logger.warning(
                    "[%s] invalid source_kind=%r → fallback to 'vault' (exigence: %r)",
                    label, sk, str(patched.get("exigence", ""))[:80],
                )
                patched["source_kind"] = "vault"
                patched["expected_template_type"] = None
                invalid_kind += 1

            # Pre-clean: unknown expected_template_type → null
            allowed_templates = {
                "dc1_template", "dc2_template", "acte_engagement_template",
                "dpgf_template", "bpu_template", "dqe_template",
                "cadre_reponse", "attestation_visite_template",
            }
            ett = patched.get("expected_template_type")
            if ett is not None and ett not in allowed_templates:
                logger.warning(
                    "[%s] invalid expected_template_type=%r → fallback to null "
                    "(exigence: %r)",
                    label, ett, str(patched.get("exigence", ""))[:80],
                )
                patched["expected_template_type"] = None
                invalid_template += 1

            try:
                req = RequirementFromAI(**patched)
            except ValidationError as e:
                logger.warning(
                    "[%s] dropping invalid requirement: %s (raw=%r)",
                    label, e.errors()[:2], str(patched.get("exigence", ""))[:80],
                )
                dropped += 1
                continue

            validated.append(req.model_dump(exclude_none=False))

        if invalid_kind or invalid_template or dropped:
            print(
                f"[DCE Analyzer] [{label}] validation: "
                f"{invalid_kind} bad source_kind, {invalid_template} bad template, "
                f"{dropped} dropped",
                flush=True,
            )
        return validated

    def _parse_json(self, raw: str) -> dict:
        """Extract JSON object from Claude's response, with repair fallback."""
        start = raw.find("{")
        if start == -1:
            return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}

        try:
            decoder = json.JSONDecoder()
            result, _ = decoder.raw_decode(raw, start)
        except json.JSONDecodeError:
            try:
                result = repair_json(raw[start:], return_objects=True)
                if not isinstance(result, dict):
                    return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}
            except Exception:
                return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}

        return result

    @property
    def is_demo(self) -> bool:
        return self._demo_mode
