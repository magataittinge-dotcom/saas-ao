"""JETABLE — run de validation du correctif chunking (Option A).

Identique à compare_a_analyse.py (mêmes textes CCAP + CCTP lot 02) MAIS :
- écrit dans A-analyse-output.CHUNKED.json (ne touche PAS le baseline 98)
- imprime un avant/après ciblé sur les exigences perdues au-delà de l'ancien cap 30k.
"""
import asyncio, json, os, pathlib, sys, time, re

sys.path.insert(0, "backend")
_envf = pathlib.Path("backend/.env")
if _envf.is_file():
    for _ln in _envf.read_text(encoding="utf-8").splitlines():
        _ln = _ln.strip()
        if _ln and not _ln.startswith("#") and "=" in _ln:
            _k, _v = _ln.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

from services.ai.dce_analyzer import DCEAnalyzer  # noqa: E402

OUT = pathlib.Path("docs/comparaison-AB")
CCAP = (OUT / "_input_CCAP.txt").read_text(encoding="utf-8")
CCTP = (OUT / "_input_CCTP_lot02_etancheite.txt").read_text(encoding="utf-8")


async def main():
    analyzer = DCEAnalyzer()
    print("demo_mode:", analyzer.is_demo)
    if analyzer.is_demo:
        print("ABORT: demo mode (pas de vraie mesure)"); return
    t0 = time.time()
    result = await analyzer.extract_full_analysis_multi_pass(
        pass1_text=CCAP, pass2_text=CCTP, lot_header="",
        selected_lot_name="Lot 02 Étanchéité / couverture", project_id=None,
    )
    elapsed = time.time() - t0
    result["_meta"] = {"elapsed_seconds": round(elapsed, 1), "pass1_chars": len(CCAP),
                       "pass2_chars": len(CCTP), "model": "claude-sonnet-4-6"}
    (OUT / "A-analyse-output.CHUNKED.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    reqs = result.get("requirements", [])
    new = json.load(open(OUT / "A-analyse-output.json", encoding="utf-8"))  # baseline 98
    base = new.get("requirements", [])
    from collections import Counter
    def dist(rs): return dict(Counter((r.get("source_document") or "?").upper() for r in rs))
    print(f"\n===== AVANT/APRÈS =====")
    print(f"BASELINE (capé, mesuré) : {len(base)} exigences  {dist(base)}")
    print(f"CHUNKÉ (correctif)      : {len(reqs)} exigences  {dist(reqs)}")
    print(f"analyzed_in_chunks      : {result.get('analyzed_in_chunks')}")
    print(f"durée                   : {elapsed:.0f}s")
    blob = " ".join(re.sub(r"\s+", " ", (r.get('exigence','') + ' ' + (r.get('source_excerpt') or ''))) for r in reqs).lower()
    print("\nExigences 'perdues' (>page 13) désormais captées ?")
    for label, needles in {
        "Assurance 8 M€": ["8 m€", "8 m "], "Pénalités 300 €/j": ["300 €", "300€"],
        "Chorus Pro": ["chorus"], "Garantie 1ère demande": ["première demande", "premiere demande"],
        "DOE / récolement": ["doe", "récolement", "recolement"],
    }.items():
        hit = any(n in blob for n in needles)
        print(f"  [{'✅' if hit else '❌'}] {label}")


asyncio.run(main())
