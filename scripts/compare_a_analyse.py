"""JETABLE — Runner Système A (services/ai/dce_analyzer, EN PROD) pour la
comparaison A/B sur l'analyse DCE. N'est PAS intégré au backend.

Appelle DCEAnalyzer.extract_full_analysis_multi_pass sur les MÊMES textes que B
(CCAP en passe 1 admin, CCTP lot 02 étanchéité en passe 2 technique).
Sortie : docs/comparaison-AB/A-analyse-output.json (+ stats).
"""

import asyncio
import json
import os
import pathlib
import sys
import time

sys.path.insert(0, "backend")

# Load backend/.env into os.environ (cwd = repo root, but Settings needs the keys).
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
    t0 = time.time()
    result = await analyzer.extract_full_analysis_multi_pass(
        pass1_text=CCAP,
        pass2_text=CCTP,
        lot_header="",
        selected_lot_name="Lot 02 Étanchéité / couverture",
        project_id=None,
    )
    elapsed = time.time() - t0
    result["_meta"] = {
        "elapsed_seconds": round(elapsed, 1),
        "pass1_chars": len(CCAP),
        "pass2_chars": len(CCTP),
        "model": getattr(DCEAnalyzer, "MODEL", "claude-sonnet-4-6"),
    }
    (OUT / "A-analyse-output.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    reqs = result.get("requirements", [])
    print(f"A: {len(reqs)} requirements, {len(result.get('criteres_jugement', []))} critères, "
          f"{elapsed:.1f}s")


asyncio.run(main())
