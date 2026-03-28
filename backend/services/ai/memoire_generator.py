import json
import anthropic
from json_repair import repair_json
from config import get_settings
from .prompts import MEMOIRE_GENERATION_SYSTEM

settings = get_settings()


class MemoireGenerator:
    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    MODEL = "claude-opus-4-5"

    async def generate(
        self,
        organization,           # Organization ORM object
        memoire_config,         # MemoireConfig ORM object or None
        project_name: str,
        maitre_ouvrage: str,
        all_docs: list,         # list of ProjectDocument objects
        compliance_items: list, # list of ComplianceItem objects
        references: list,       # list of Reference objects
        variables: dict,
        criteres_jugement: list | None = None,  # from project.criteres_jugement
    ) -> dict:
        """Generate a complete mémoire technique using Claude Opus."""

        # ── 1. Company profile ────────────────────────────────────────────────
        # Merge Organization fields with richer MemoireConfig if available
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
            # Identify highest-weighted technical sub-criterion
            tech = next((c for c in criteres_jugement if c["poids"] >= 40 and c.get("sous_criteres")), None)
            if tech:
                top_sc = max(tech["sous_criteres"], key=lambda x: x["poids"], default=None)
                if top_sc:
                    lines.append(f"\n⚡ INSISTE PARTICULIÈREMENT sur '{top_sc['nom']}' ({top_sc['poids']}%) — c'est le sous-critère le mieux pondéré.")
            criteres_block = "\n".join(lines)

        # ── 6. Build prompt ───────────────────────────────────────────────────
        prompt = (
            f"MARCHÉ : {project_name}\n"
            f"MAÎTRE D'OUVRAGE : {maitre_ouvrage or 'Non renseigné'}\n\n"
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

        # ── 6. Stream from Opus ───────────────────────────────────────────────
        chunks = []
        async with self.client.messages.stream(
            model=self.MODEL,
            max_tokens=16000,
            system=MEMOIRE_GENERATION_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            async for text in stream.text_stream:
                chunks.append(text)

        raw = "".join(chunks).strip()

        # ── 7. Parse JSON ─────────────────────────────────────────────────────
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
