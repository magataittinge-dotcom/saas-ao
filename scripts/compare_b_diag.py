"""JETABLE — diagnostic : pourquoi le Client synorix échoue à parser la sortie Claude.
Réplique Client.complete mais renvoie le texte BRUT + stop_reason (pas de json.loads)."""
import os, pathlib, sys, asyncio
sys.path.insert(0, "backend")
_envf = pathlib.Path("backend/.env")
for _ln in _envf.read_text(encoding="utf-8").splitlines():
    _ln=_ln.strip()
    if _ln and not _ln.startswith("#") and "=" in _ln:
        k,v=_ln.split("=",1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
import synorix.skills.extraction  # noqa
from anthropic import AsyncAnthropic
from synorix.skills.registry import SKILLS
from synorix.skills.extraction.extraction_exigences_administratives import Input
OUT = pathlib.Path("docs/comparaison-AB")
CCAP = (OUT/"_input_CCAP.txt").read_text(encoding="utf-8")[:18000]  # slice pour rester sous 30K TPM
skill = SKILLS["extraction-exigences-administratives"]()
inp = Input(project_id=1, rc_text="", ccap_text=CCAP)
async def main():
    cl = AsyncAnthropic()
    r = await cl.messages.create(model=skill.model, max_tokens=4096, temperature=0.0,
        system=skill.system_prompt,
        messages=[{"role":"user","content":skill._build_user_prompt(inp)}])
    block = r.content[0]
    txt = getattr(block,"text","<no text attr>")
    print("stop_reason:", r.stop_reason)
    print("usage:", r.usage.input_tokens, "in /", r.usage.output_tokens, "out")
    print("content[0] type:", block.type)
    print("len(text):", len(txt))
    print("--- FIRST 300 ---"); print(repr(txt[:300]))
    print("--- LAST 300 ---"); print(repr(txt[-300:]))
asyncio.run(main())
