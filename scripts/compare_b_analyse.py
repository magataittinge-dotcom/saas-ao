"""JETABLE — Runner Système B (synorix/skills/, 91 skills) pour la comparaison
A/B sur l'analyse DCE. N'est PAS intégré au backend.

Peuple registry.SKILLS, instancie le Client synorix (AsyncAnthropic), puis appelle
les skills d'extraction sur les MÊMES textes que A :
  - extraction-exigences-administratives  (ccap_text = CCAP)
  - extraction-exigences-techniques       (cctp_text = CCTP lot 02)
  - extraction-criteres-jugement          (rc_text = CCAP)
  - extraction-pieces-offre               (ccap_text = CCAP)
Chaque skill est isolée (try/except) : si B plante (truncation JSON, etc.),
c'est une donnée à logger.
Sortie : docs/comparaison-AB/B-analyse-output.json
"""

import asyncio
import json
import os
import pathlib
import sys
import time

sys.path.insert(0, "backend")

_envf = pathlib.Path("backend/.env")
if _envf.is_file():
    for _ln in _envf.read_text(encoding="utf-8").splitlines():
        _ln = _ln.strip()
        if _ln and not _ln.startswith("#") and "=" in _ln:
            _k, _v = _ln.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

# Populate registry.SKILLS
import synorix.skills.extraction  # noqa: F401,E402
from synorix.ai.client import Client  # noqa: E402
from synorix.skills.registry import invoke, SKILLS  # noqa: E402
from synorix.skills.extraction.extraction_exigences_administratives import Input as AdminIn  # noqa: E402
from synorix.skills.extraction.extraction_exigences_techniques import Input as TechIn  # noqa: E402
from synorix.skills.extraction.extraction_criteres_jugement import Input as CritIn  # noqa: E402
from synorix.skills.extraction.extraction_pieces_offre import Input as PiecesIn  # noqa: E402

OUT = pathlib.Path("docs/comparaison-AB")
CCAP = (OUT / "_input_CCAP.txt").read_text(encoding="utf-8")
CCTP = (OUT / "_input_CCTP_lot02_etancheite.txt").read_text(encoding="utf-8")


async def run_one(name, inp, client):
    t0 = time.time()
    try:
        out = await invoke(name, inp, client=client)
        return {"ok": True, "elapsed_s": round(time.time() - t0, 1),
                "output": out.model_dump()}
    except Exception as e:
        return {"ok": False, "elapsed_s": round(time.time() - t0, 1),
                "error": f"{type(e).__name__}: {e}"}


async def main():
    print("SKILLS registered:", len(SKILLS))
    client = Client()
    jobs = {
        "extraction-exigences-administratives": AdminIn(project_id=1, rc_text="", ccap_text=CCAP),
        "extraction-exigences-techniques": TechIn(project_id=1, cctp_text=CCTP),
        "extraction-criteres-jugement": CritIn(project_id=1, rc_text=CCAP),
        "extraction-pieces-offre": PiecesIn(project_id=1, rc_text="", ccap_text=CCAP),
    }
    results = {}
    for name, inp in jobs.items():
        print(f"→ {name} (model={SKILLS[name].model}) ...", flush=True)
        results[name] = await run_one(name, inp, client)
        r = results[name]
        print(f"   {'OK' if r['ok'] else 'FAIL'} {r['elapsed_s']}s "
              f"{r.get('error','')}", flush=True)
    results["_meta"] = {
        "max_tokens_per_call": 4096,
        "client": "synorix/ai/client.py (AsyncAnthropic, non-streaming)",
        "ccap_chars": len(CCAP), "cctp_chars": len(CCTP),
    }
    (OUT / "B-analyse-output.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")


asyncio.run(main())
