"""JETABLE — Test END-TO-END Bloc 1 (Mission Nuit).

Pilote le pipeline réel via appel DIRECT des services (fallback autorisé, comme
les scripts de comparaison A/B), car le montage serveur+DB+Celery complet est
trop lourd/fragile pour cette nuit.

Étapes :
  1. ANALYSE  : RÉUTILISÉE depuis docs/comparaison-AB/A-analyse-output.json
                (98 exigences, 100% traçabilité — 0 appel API)
  2. CHECKLIST: ChecklistMatcher (Python pur, 0 API)
  3. MÉMOIRE  : MemoireGenerator.generate (1 appel Opus — compteur mémoire 1/3)
  4. EXPORT   : build_memoire_docx (déterministe, 0 API)

Scénario "comme Adil le verra" : organisation au profil VIDE (= seed_test_user
'OZDEM TEST'), pour vérifier que le mémoire place des [À COMPLÉTER PAR
L'ENTREPRISE] SANS inventer de données entreprise.
"""

import asyncio
import json
import os
import pathlib
import sys
import time
from types import SimpleNamespace

sys.path.insert(0, "backend")

# Load backend/.env into os.environ.
_envf = pathlib.Path("backend/.env")
if _envf.is_file():
    for _ln in _envf.read_text(encoding="utf-8").splitlines():
        _ln = _ln.strip()
        if _ln and not _ln.startswith("#") and "=" in _ln:
            _k, _v = _ln.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

AB = pathlib.Path("docs/comparaison-AB")
OUT = pathlib.Path("docs/nuit-rapport")
OUT.mkdir(parents=True, exist_ok=True)

CCAP = (AB / "_input_CCAP.txt").read_text(encoding="utf-8")
CCTP = (AB / "_input_CCTP_lot02_etancheite.txt").read_text(encoding="utf-8")
ANALYSE = json.load(open(AB / "A-analyse-output.json", encoding="utf-8"))
REQS = ANALYSE["requirements"]
INFOS = ANALYSE["infos_marche"]

PROJECT_NAME = INFOS.get("objet") or "Restructuration école de Gueux"
MAITRE_OUVRAGE = INFOS.get("maitre_ouvrage") or "Commune de GUEUX"
SELECTED_LOT = "Lot 02 - Étanchéité - Couverture"

results_meta = {}
_CAP = {"text": "", "stop_reason": None, "usage": {}}


# ── Étape 2 : CHECKLIST CANDIDATURE (0 API) ────────────────────────────────────
async def step_checklist():
    from services.ai.checklist_matcher import ChecklistMatcher
    cand = [r for r in REQS if r.get("category") == "candidature"]
    # On inclut aussi les dce_template (DC1/DC2/AE) repérés.
    matcher = ChecklistMatcher()
    t0 = time.time()
    # vault vide (Adil n'a rien uploadé), pas de db → dce_template = message fallback.
    checklist = await matcher.match(cand, vault_documents=[], project_id=None, db=None)
    elapsed = time.time() - t0
    (OUT / "BLOC1-checklist.json").write_text(
        json.dumps(checklist, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    results_meta["checklist"] = {
        "candidature_reqs": len(cand),
        "items": len(checklist),
        "elapsed_s": round(elapsed, 3),
    }
    print(f"[CHECKLIST] {len(cand)} exigences candidature → {len(checklist)} items, {elapsed:.3f}s")
    for it in checklist:
        print(f"   - [{it['document_type_required']}] status={it['status']} :: {it['details'][:80]}")
    return checklist


# ── Étape 3 : MÉMOIRE TECHNIQUE (1 appel Opus) ─────────────────────────────────
async def step_memoire():
    from services.ai.memoire_generator import MemoireGenerator

    # ── PATCH JETABLE (hors cœur) : claude-opus-4-7 a déprécié `temperature`.
    # Le cœur memoire_generator.py passe temperature=0 (hardcodé l.433) → 400.
    # On NE MODIFIE PAS le cœur (règle nuit) : on strip le kwarg au niveau du
    # client Anthropic, uniquement dans ce script de test.
    # On bump aussi max_tokens : le cœur hardcode max_tokens=16000 (l.432), ce
    # qui TRONQUE le mémoire (stop_reason=max_tokens, partie_c manquante). Pour
    # l'inspection qualité on monte à 32000 (max opus-4-7) — toujours sans
    # toucher le cœur. C'est un FINDING documenté, pas un fix appliqué au repo.
    import anthropic.resources.messages as _am

    class _TeeManager:
        """Proxy le MessageStreamManager pour capturer le texte brut streamé
        et le stop_reason — afin d'inspecter le mémoire même s'il est tronqué."""
        def __init__(self, mgr):
            self._mgr = mgr
        def __enter__(self):
            self._s = self._mgr.__enter__()
            return self
        def __exit__(self, *a):
            return self._mgr.__exit__(*a)
        @property
        def text_stream(self):
            for t in self._s.text_stream:
                _CAP["text"] += t
                yield t
        def get_final_message(self):
            m = self._s.get_final_message()
            _CAP["stop_reason"] = m.stop_reason
            u = getattr(m, "usage", None)
            _CAP["usage"] = {
                "input": getattr(u, "input_tokens", 0),
                "output": getattr(u, "output_tokens", 0),
                "cache_read": getattr(u, "cache_read_input_tokens", 0),
                "cache_write": getattr(u, "cache_creation_input_tokens", 0),
            } if u else {}
            return m
        def __getattr__(self, n):
            return getattr(self._s, n)

    if not getattr(_am.Messages, "_temp_stripped", False):
        _orig_stream = _am.Messages.stream
        def _patched_stream(self, *a, **k):
            k.pop("temperature", None)
            if k.get("max_tokens", 0) and k["max_tokens"] < 32000:
                k["max_tokens"] = 32000
            return _TeeManager(_orig_stream(self, *a, **k))
        _am.Messages.stream = _patched_stream
        _am.Messages._temp_stripped = True
        print("[PATCH] temperature retiré + max_tokens→32000 + capture brut (cœur intact)")

    # Organisation au profil VIDE (scénario réaliste 'OZDEM TEST').
    org = SimpleNamespace(
        id="test-org", name="OZDEM TEST", siret="12345678901234", address=None,
        historique=None, activites=None, organigramme=None,
        moyens_informatiques=None, vehicules=None, materiel=None, fournisseurs=None,
    )

    # Documents DCE (CCTP étanchéité prioritaire pour la méthodologie).
    all_docs = [
        SimpleNamespace(type="cctp", file_name="CCTP_lot02_etancheite.pdf", extracted_text=CCTP),
        SimpleNamespace(type="autre", file_name="CCAP.pdf", extracted_text=CCAP),
    ]

    # Compliance items dérivés des exigences réelles.
    compliance_items = [
        SimpleNamespace(category=r.get("category", "technique"), exigence_text=r.get("exigence", ""))
        for r in REQS
    ]

    variables = {
        "nb_ouvriers": 6,
        "delai": "Selon planning DCE",
    }

    gen = MemoireGenerator()
    print(f"[MÉMOIRE] Modèle={gen.MODEL} — lot={SELECTED_LOT}")
    print("[MÉMOIRE] >>> APPEL API (compteur mémoire 1/3) <<<")
    t0 = time.time()
    gen_error = None
    try:
        content = await gen.generate(
            organization=org,
            memoire_config=None,
            project_name=PROJECT_NAME,
            maitre_ouvrage=MAITRE_OUVRAGE,
            selected_lot_name=SELECTED_LOT,
            all_docs=all_docs,
            compliance_items=compliance_items,
            references=[],
            variables=variables,
            criteres_jugement=ANALYSE.get("criteres_jugement") or [],
            reference_template_text=None,
            project_id=None,
        )
    except Exception as e:
        gen_error = e
        content = None
    elapsed = time.time() - t0

    # Toujours sauvegarder le BRUT capturé (même tronqué) pour inspection qualité.
    (OUT / "memoire-gueux-RAW.txt").write_text(_CAP["text"], encoding="utf-8")
    (OUT / "memoire-gueux-CAPTURE.json").write_text(
        json.dumps({
            "stop_reason": _CAP["stop_reason"],
            "usage": _CAP["usage"],
            "raw_chars": len(_CAP["text"]),
            "elapsed_s": round(elapsed, 1),
            "gen_error": str(gen_error) if gen_error else None,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[CAPTURE] stop_reason={_CAP['stop_reason']} raw_chars={len(_CAP['text'])} "
          f"usage={_CAP['usage']} err={gen_error}")
    if gen_error is not None:
        # On tente une réparation locale (json_repair) du brut pour inspection,
        # SANS relancer d'appel API (budget).
        try:
            from json_repair import repair_json
            start = _CAP["text"].find("{")
            repaired = repair_json(_CAP["text"][start:], return_objects=True) if start >= 0 else None
            if isinstance(repaired, dict):
                content = repaired
                print(f"[CAPTURE] json_repair → clés récupérées: {list(content.keys())}")
        except Exception as e2:
            print(f"[CAPTURE] json_repair échec: {e2}")
    if content is None:
        raise gen_error if gen_error else RuntimeError("Pas de contenu")
    (OUT / "memoire-gueux-genere.json").write_text(
        json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    results_meta["memoire"] = {
        "model": gen.MODEL,
        "elapsed_s": round(elapsed, 1),
        "top_keys": list(content.keys()),
    }
    print(f"[MÉMOIRE] OK en {elapsed:.1f}s — clés: {list(content.keys())}")
    return content, org


# ── Rendu markdown lisible du mémoire ──────────────────────────────────────────
def render_markdown(content: dict) -> str:
    lines = [f"# Mémoire technique — {PROJECT_NAME}", "", f"**Maître d'ouvrage :** {MAITRE_OUVRAGE}",
             f"**Lot :** {SELECTED_LOT}", "", "---", ""]
    pre = content.get("preambule", "")
    if pre:
        lines += ["## Préambule", "", str(pre), ""]
    part_titles = {"partie_a": "PARTIE A — Présentation générale",
                   "partie_b": "PARTIE B — Présentation de la prestation",
                   "partie_c": "PARTIE C — Méthodologie mise en œuvre"}
    for pk, ptitle in part_titles.items():
        sec = content.get(pk, {})
        if not isinstance(sec, dict):
            continue
        lines += [f"## {ptitle}", ""]
        for subk, subv in sec.items():
            lines += [f"### {subk}", "", str(subv), ""]
    return "\n".join(lines)


# ── Étape 5 : EXPORT DOCX (0 API) ──────────────────────────────────────────────
def step_export(content: dict, org):
    from services.docx_exporter import build_memoire_docx
    t0 = time.time()
    docx_bytes = build_memoire_docx(
        content_json=content,
        project_name=PROJECT_NAME[:60],
        org_name=org.name,
    )
    elapsed = time.time() - t0
    docx_path = OUT / "memoire-gueux.docx"
    docx_path.write_bytes(docx_bytes)
    results_meta["export"] = {
        "docx_bytes": len(docx_bytes),
        "elapsed_s": round(elapsed, 3),
        "path": str(docx_path),
    }
    print(f"[EXPORT] DOCX {len(docx_bytes):,} bytes en {elapsed:.3f}s → {docx_path}")


async def main():
    print("=" * 70)
    print("BLOC 1 — TEST END-TO-END (DCE Gueux, lot 02 Étanchéité)")
    print("=" * 70)
    print(f"[ANALYSE] RÉUTILISÉE : {len(REQS)} exigences (0 API)")

    await step_checklist()
    content, org = await step_memoire()

    md = render_markdown(content)
    (OUT / "memoire-gueux-genere.md").write_text(md, encoding="utf-8")
    results_meta["memoire"]["markdown_chars"] = len(md)
    print(f"[MÉMOIRE] Markdown {len(md):,} chars → memoire-gueux-genere.md")

    step_export(content, org)

    (OUT / "BLOC1-meta.json").write_text(
        json.dumps(results_meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("\n=== META ===")
    print(json.dumps(results_meta, ensure_ascii=False, indent=2))


asyncio.run(main())
