"""JETABLE — Checkpoint mémoire RÉPARÉ (découpage par partie).

Appelle le MemoireGenerator RÉPARÉ (sans monkeypatch : temperature retirée,
max_tokens=32000, 4 appels par partie, récupération gracieuse) sur le DCE Gueux
lot 02 étanchéité. Vérifie 26/26 sous-sections + stop_reason par appel.
Sortie : docs/nuit-rapport/memoire-gueux-REPARE.{md,json} + meta.
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
OUT = pathlib.Path("docs/nuit-rapport")
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


def render_markdown(content: dict) -> str:
    lines = [f"# Mémoire technique — {PROJECT_NAME}", "",
             f"**Maître d'ouvrage :** {MAITRE_OUVRAGE}", f"**Lot :** {SELECTED_LOT}", "", "---", ""]
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
    from services.ai.memoire_generator import MemoireGenerator, _MEMOIRE_SEGMENTS

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
    print("CHECKPOINT — Mémoire RÉPARÉ (4 appels par partie) — Gueux lot 02")
    print(f"Modèle={gen.MODEL}")
    print(">>> 1 GÉNÉRATION API (4 appels Opus séquentiels) <<<")
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

    # Sauvegardes
    (OUT / "memoire-gueux-REPARE.json").write_text(
        json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8")
    md = render_markdown(content)
    (OUT / "memoire-gueux-REPARE.md").write_text(md, encoding="utf-8")

    # Vérif 26/26 sous-sections
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

    meta = content.get("_generation_meta", {})
    segs = meta.get("segments", [])
    print("\n" + "=" * 70)
    print(f"RÉSULTAT : {present}/{total_expected} sous-sections présentes")
    print(f"Manquantes : {missing or 'AUCUNE'}")
    print(f"Temps total : {elapsed:.1f}s")
    print("\nPar appel :")
    tot_out = tot_in = tot_cr = tot_cw = 0
    for s in segs:
        print(f"  - {s.get('segment'):12s} stop={s.get('stop_reason'):10s} "
              f"out={s.get('output_tokens')} in={s.get('input_tokens')} "
              f"cache_read={s.get('cache_read')} cache_write={s.get('cache_write')} "
              f"{s.get('elapsed_s')}s")
        tot_out += s.get("output_tokens", 0) or 0
        tot_in += s.get("input_tokens", 0) or 0
        tot_cr += s.get("cache_read", 0) or 0
        tot_cw += s.get("cache_write", 0) or 0
    truncated = [s["segment"] for s in segs if s.get("truncated")]
    print(f"\nTroncatures (stop_reason=max_tokens) : {truncated or 'AUCUNE'}")
    print(f"Tokens cumulés : out={tot_out} in_uncached={tot_in} cache_read={tot_cr} cache_write={tot_cw}")
    # Coût estimé Opus 4.7 : in $15/M, out $75/M, cache_write $18.75/M, cache_read $1.5/M
    cost = (tot_in * 15 + tot_out * 75 + tot_cw * 18.75 + tot_cr * 1.5) / 1_000_000
    print(f"Coût estimé : ≈ {cost:.2f} $")
    print(f"Markdown : {len(md):,} chars → memoire-gueux-REPARE.md")
    print("=" * 70)


asyncio.run(main())
