import json
import asyncio
import time
import anthropic
from json_repair import repair_json
from config import get_settings
from .prompts import DCE_ANALYSIS_SYSTEM, DCE_PASS1_SYSTEM, DCE_PASS2_SYSTEM
from services.skill_loader import load_skill, load_skill_section
import logging

logger = logging.getLogger(__name__)
settings = get_settings()

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
    ) -> dict:
        """Two-pass analysis: admin docs (RC+CCAP) then technical docs (CCTP+DPGF).
        Each call is <30K chars → response <60s → no WSL2 timeout."""
        if self._demo_mode:
            return _DEMO_RESULT

        # Build skills supplement once for both passes (context-aware)
        skills_ref, _ = _build_dce_skills(selected_lot_name)

        # ── Pass 1: RC + CCAP (administrative) ──────────────────────────────
        prompt1 = lot_header + pass1_text if lot_header else pass1_text
        prompt1 = self._guard_tokens(prompt1, "passe1-admin")
        result1 = await asyncio.to_thread(
            self._sync_call, prompt1, DCE_PASS1_SYSTEM, "passe1-admin", skills_ref
        )

        # Notify caller that pass 1 is done (for progress tracking)
        if on_pass1_done:
            on_pass1_done()

        # ── Pass 2: CCTP + DPGF (technical) ─────────────────────────────────
        result2 = {"requirements": []}
        if pass2_text:
            prompt2 = lot_header + pass2_text if lot_header else pass2_text
            prompt2 = self._guard_tokens(prompt2, "passe2-technique")
            result2 = await asyncio.to_thread(
                self._sync_call, prompt2, DCE_PASS2_SYSTEM, "passe2-technique", skills_ref
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

        return output

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

    def _sync_call(self, dce_text: str, system_prompt: str, label: str = "", skills_ref: str = "") -> dict:
        """Synchronous streaming Claude call with 3 retries — runs in a thread.

        Streaming keeps TCP alive (bytes every ~100ms), avoiding WSL2 NAT timeout.
        """
        user_content = f"Voici les documents DCE à analyser :\n\n{dce_text}"
        if skills_ref:
            user_content += (
                f"\n\n━━━ RÉFÉRENTIELS COMPLÉMENTAIRES (expertise BTP) ━━━\n"
                f"Utilise ces référentiels pour enrichir ton analyse — "
                f"ils contiennent les normes DTU exactes, la réglementation marchés publics 2026, "
                f"et les bonnes pratiques d'extraction d'exigences DCE.\n\n"
                f"{skills_ref}"
            )
        last_error = None

        for attempt in range(1, 4):
            t0 = time.monotonic()
            try:
                print(f"[DCE Analyzer] [{label}] Tentative {attempt}/3 (streaming)...", flush=True)
                collected = ""

                with self.client.messages.stream(
                    model="claude-sonnet-4-20250514",
                    max_tokens=8000,
                    temperature=0,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_content}],
                ) as stream:
                    for text in stream.text_stream:
                        collected += text

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
                if e.status_code in (429, 500, 502, 503, 529) and attempt < 3:
                    elapsed = time.monotonic() - t0
                    print(f"[DCE Analyzer] [{label}] Tentative {attempt} status {e.status_code} après {elapsed:.1f}s, retry...", flush=True)
                    last_error = e
                    time.sleep(5)
                else:
                    raise Exception(f"Erreur API Claude (status {e.status_code}): {e.message}")
        else:
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

        reqs = result.get("requirements", [])
        print(f"[DCE Analyzer] [{label}] {len(reqs)} exigences extraites", flush=True)

        if partial:
            result["partial_analysis"] = True

        return result

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
