"""JETABLE — Génération mémoire HYBRIDE (Sonnet a/b + Opus méthodologie).

Utilise le mapping par défaut _MEMOIRE_SEGMENT_MODELS (hybride) — aucun override.
Même DCE Gueux lot 02, même profil, mêmes skills.
Sortie : docs/comparaison-memoire-AB/memoire-gueux-HYBRIDE.{md,json}.
"""

import asyncio
import json
import os
import pathlib
import sys
import time
from types import SimpleNamespace

sys.path.insert(0, "backend")

_envf = pathlib.Path("backend/.env")
if _envf.is_file():
    for _ln in _envf.read_text(encoding="utf-8").splitlines():
        _ln = _ln.strip()
        if _ln and not _ln.startswith("#") and "=" in _ln:
            _k, _v = _ln.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

AB = pathlib.Path("docs/comparaison-AB")
OUT = pathlib.Path("docs/comparaison-memoire-AB")
OUT.mkdir(parents=True, exist_ok=True)
CCAP = (AB / "_input_CCAP.txt").read_text(encoding="utf-8")
CCTP = (AB / "_input_CCTP_lot02_etancheite.txt").read_text(encoding="utf-8")
ANALYSE = json.load(open(AB / "A-analyse-output.json", encoding="utf-8"))
REQS = ANALYSE["requirements"]
INFOS = ANALYSE["infos_marche"]

PROJECT_NAME = INFOS.get("objet") or "Restructuration école de Gueux"
MAITRE_OUVRAGE = INFOS.get("maitre_ouvrage") or "Commune de GUEUX"
SELECTED_LOT = "Lot 02 - Étanchéité - Couverture"

_PART_TITLES = {
    "partie_a": "PARTIE A — Présentation générale",
    "partie_b": "PARTIE B — Présentation de la prestation",
    "partie_c": "PARTIE C — Méthodologie mise en œuvre",
}

# Tarifs $/M tokens par modèle (in, out, cache_write, cache_read)
PRICING = {
    "claude-opus-4-7":   (15.0, 75.0, 18.75, 1.50),
    "claude-sonnet-4-6": (3.0, 15.0, 3.75, 0.30),
}


def render_markdown(content: dict) -> str:
    models = content.get("_generation_meta", {}).get("models", {})
    lines = [f"# Mémoire technique — {PROJECT_NAME}", "",
             f"**Maître d'ouvrage :** {MAITRE_OUVRAGE}", f"**Lot :** {SELECTED_LOT}",
             f"**Modèles (hybride) :** {models}", "", "---", ""]
    pre = content.get("preambule", "")
    if pre:
        lines += ["## Préambule", "", str(pre), ""]
    for pk, ptitle in _PART_TITLES.items():
        sec = content.get(pk, {})
        if not isinstance(sec, dict):
            continue
        lines += [f"## {ptitle}", ""]
        for subk, subv in sec.items():
            lines += [f"### {subk}", "", str(subv), ""]
    return "\n".join(lines)


async def main():
    from services.ai.memoire_generator import MemoireGenerator, _MEMOIRE_SEGMENTS, _MEMOIRE_SEGMENT_MODELS

    org = SimpleNamespace(
        id="test-org", name="OZDEM TEST", siret="12345678901234", address=None,
        historique=None, activites=None, organigramme=None,
        moyens_informatiques=None, vehicules=None, materiel=None, fournisseurs=None,
    )
    all_docs = [
        SimpleNamespace(type="cctp", file_name="CCTP_lot02_etancheite.pdf", extracted_text=CCTP),
        SimpleNamespace(type="autre", file_name="CCAP.pdf", extracted_text=CCAP),
    ]
    compliance_items = [
        SimpleNamespace(category=r.get("category", "technique"), exigence_text=r.get("exigence", ""))
        for r in REQS
    ]

    gen = MemoireGenerator()
    print("=" * 70)
    print(f"GÉNÉRATION HYBRIDE — Gueux lot 02 — mapping={_MEMOIRE_SEGMENT_MODELS}")
    print(">>> 1 GÉNÉRATION API (4 appels : 3 Sonnet + 1 Opus) <<<")
    print("=" * 70)
    t0 = time.time()
    content = await gen.generate(
        organization=org, memoire_config=None,
        project_name=PROJECT_NAME, maitre_ouvrage=MAITRE_OUVRAGE,
        selected_lot_name=SELECTED_LOT, all_docs=all_docs,
        compliance_items=compliance_items, references=[], variables={},
        criteres_jugement=ANALYSE.get("criteres_jugement") or [],
        reference_template_text=None, project_id=None,
    )
    elapsed = time.time() - t0

    (OUT / "memoire-gueux-HYBRIDE.json").write_text(
        json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8")
    md = render_markdown(content)
    (OUT / "memoire-gueux-HYBRIDE.md").write_text(md, encoding="utf-8")

    expected = {k: sub for k, sub in _MEMOIRE_SEGMENTS}
    total_expected = 1 + sum(len(sub) for sub in expected.values() if sub)
    present, missing = 0, []
    if content.get("preambule") and "À RÉGÉNÉRER" not in str(content["preambule"]):
        present += 1
    else:
        missing.append("preambule")
    for pk in ("partie_a", "partie_b", "partie_c"):
        for sk in expected[pk]:
            v = content.get(pk, {}).get(sk, "")
            if v and "À RÉGÉNÉRER" not in str(v):
                present += 1
            else:
                missing.append(f"{pk}.{sk}")

    segs = content.get("_generation_meta", {}).get("segments", [])
    print(f"\nRÉSULTAT HYBRIDE : {present}/{total_expected} sous-sections — manquantes: {missing or 'AUCUNE'}")
    print(f"Temps total : {elapsed:.1f}s")
    total_cost = 0.0
    for s in segs:
        mdl = s.get("model", "?")
        pin, pout, pcw, pcr = PRICING.get(mdl, (0, 0, 0, 0))
        c = (s.get("input_tokens", 0) * pin + s.get("output_tokens", 0) * pout
             + s.get("cache_write", 0) * pcw + s.get("cache_read", 0) * pcr) / 1_000_000
        total_cost += c
        print(f"  - {s.get('segment'):12s} [{mdl:18s}] stop={s.get('stop_reason')} "
              f"out={s.get('output_tokens')} cache_read={s.get('cache_read')} "
              f"cache_write={s.get('cache_write')} {s.get('elapsed_s')}s → ≈{c:.3f}$")
    truncated = [s["segment"] for s in segs if s.get("truncated")]
    print(f"Troncatures : {truncated or 'AUCUNE'}")
    print(f"COÛT TOTAL HYBRIDE estimé : ≈ {total_cost:.3f} $")
    print(f"Markdown : {len(md):,} chars")


asyncio.run(main())
