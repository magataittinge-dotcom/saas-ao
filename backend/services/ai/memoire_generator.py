import json
import asyncio
import time
import anthropic
from json_repair import repair_json
from config import get_settings
from .prompts import MEMOIRE_GENERATION_SYSTEM

settings = get_settings()

_DETAIL_INSTRUCTION = "Génère un mémoire technique COMPLET et DÉTAILLÉ de 20 à 25 pages. Chaque section doit être exhaustive."


class MemoireGenerator:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    MODEL = "claude-opus-4-5"

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
    ) -> dict:
        """Generate a complete mémoire technique using Claude Opus."""

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

        # ── 2. References ──────────────────────────────────────────────────────
        ref_list = [
            {
                "intitule": r.intitule,
                "maitre_ouvrage": r.maitre_ouvrage,
                "lot": r.lot,
                "montant_ht": r.montant_ht,
                "annee": r.annee,
                "description": getattr(r, "description", None),
            }
            for r in references[:35]
        ]

        # ── 3. DCE text (priority: RC then CCTP) ───────────────────────────────
        PRIORITY = {"rc": 0, "cctp": 1, "acte_engagement": 2, "dpgf": 3, "plan": 4, "autre": 5}
        docs_sorted = sorted(all_docs, key=lambda d: PRIORITY.get(d.type, 5))

        dce_parts = []
        total_chars = 0
        MAX_DCE_CHARS = 40_000
        MAX_PER_DOC = {"rc": 16_000, "cctp": 18_000}

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
            for item in compliance_items[:40]
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

        # ── 6. Build prompt ────────────────────────────────────────────────────
        prompt = (
            f"MARCHÉ : {project_name}\n"
            f"MAÎTRE D'OUVRAGE : {maitre_ouvrage or 'Non renseigné'}\n"
            f"TYPE DE LOT : {selected_lot_name or 'Non renseigné'}\n\n"
            f"CONSIGNE LONGUEUR : {_DETAIL_INSTRUCTION}\n\n"
            f"━━━ VARIABLES CHANTIER ━━━\n"
            f"{json.dumps(variables, ensure_ascii=False, indent=2)}\n\n"
            + (f"━━━ CRITÈRES DE JUGEMENT ━━━\n{criteres_block}\n\n" if criteres_block else "")
            + f"━━━ PROFIL ENTREPRISE (memoire_config) ━━━\n"
            f"{json.dumps(company_block, ensure_ascii=False, indent=2)}\n\n"
            f"━━━ RÉFÉRENCES CHANTIERS ━━━\n"
            f"{json.dumps(ref_list, ensure_ascii=False, indent=2)}\n\n"
            + (f"━━━ EXIGENCES DCE (compliance matrix) ━━━\n{compliance_summary}\n\n" if compliance_summary else "")
            + f"━━━ DOCUMENTS DCE ━━━\n{dce_text}"
        )

        # ── 8. Reference template (style guide from imported mémoire) ────────
        if reference_template_text:
            prompt += (
                f"\n\n━━━ MÉMOIRE DE RÉFÉRENCE (style et structure à reproduire) ━━━\n"
                f"Voici un extrait d'un mémoire technique précédent de l'entreprise. "
                f"Adapte le style, le ton, le niveau de détail et la structure à cet exemple. "
                f"Ne copie PAS le contenu — adapte uniquement le style.\n\n"
                f"{reference_template_text[:10_000]}"
            )

        # ── 9. Call Opus via sync client in thread ────────────────────────────
        return await asyncio.to_thread(self._sync_call, prompt)

    def _sync_call(self, prompt: str) -> dict:
        """Synchronous streaming Claude call — runs in a thread.

        Streaming keeps the TCP connection alive (bytes every ~100ms),
        avoiding WSL2 NAT timeout at ~185s for long Opus generations.
        """
        last_error = None
        for attempt in range(1, 4):
            t0 = time.monotonic()
            try:
                print(f"[Memoire Generator] Tentative {attempt}/3 — streaming Opus ({len(prompt)} chars)", flush=True)
                collected = ""

                with self.client.messages.stream(
                    model=self.MODEL,
                    max_tokens=16000,
                    temperature=0,
                    system=MEMOIRE_GENERATION_SYSTEM,
                    messages=[{"role": "user", "content": prompt}],
                ) as stream:
                    for text in stream.text_stream:
                        collected += text

                final_message = stream.get_final_message()
                elapsed = time.monotonic() - t0
                stop_reason = final_message.stop_reason
                print(
                    f"[TIMING] Memoire streaming: {elapsed:.1f}s, {len(collected)} chars, "
                    f"stop_reason={stop_reason}",
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
