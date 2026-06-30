"""JETABLE — diagnostic du call TECHNIQUE (CCTP lot 02) : raw output + stop_reason."""
import os, pathlib, sys, asyncio, json
sys.path.insert(0, "backend")
_envf = pathlib.Path("backend/.env")
for _ln in _envf.read_text(encoding="utf-8").splitlines():
    _ln = _ln.strip()
    if _ln and not _ln.startswith("#") and "=" in _ln:
        k, v = _ln.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
import synorix.skills.extraction  # noqa
from anthropic import AsyncAnthropic
from synorix.skills.registry import SKILLS
from synorix.skills.extraction.extraction_exigences_techniques import Input
OUT = pathlib.Path("docs/comparaison-AB")
CCTP = (OUT / "_input_CCTP_lot02_etancheite.txt").read_text(encoding="utf-8")
skill = SKILLS["extraction-exigences-techniques"]()
inp = Input(project_id=1, cctp_text=CCTP)


async def main():
    cl = AsyncAnthropic()
    r = await cl.messages.create(
        model=skill.model, max_tokens=4096, temperature=0.0,
        system=skill.system_prompt,
        messages=[{"role": "user", "content": skill._build_user_prompt(inp)}],
    )
    block = r.content[0]
    txt = getattr(block, "text", "")
    print("stop_reason:", r.stop_reason, "| usage:",
          r.usage.input_tokens, "in /", r.usage.output_tokens, "out")
    print("len(text):", len(txt))
    print("--- FIRST 200 ---"); print(repr(txt[:200]))
    print("--- LAST 200 ---"); print(repr(txt[-200:]))
    try:
        d = json.loads(txt)
        print("JSON OK, exigences:", len(d.get("exigences", [])))
    except Exception as e:
        print("json.loads FAIL:", e)


asyncio.run(main())
