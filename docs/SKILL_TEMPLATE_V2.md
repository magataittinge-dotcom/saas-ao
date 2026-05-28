# Skill Template — Synorix v2.1

**How to build a Synorix skill.** Companion to [`ARCHITECTURE_V2.md §6`](./ARCHITECTURE_V2.md) and [`SKILLS_REGISTRY_V2.md`](./SKILLS_REGISTRY_V2.md).

| Field | Value |
|---|---|
| Version | 2.1 |
| Status | Active — authoritative build guide for all skills |
| Foundation | `backend/synorix/skills/` (base.py, registry.py) + `backend/synorix/ai/client.py` |
| Pilot reference | `backend/synorix/skills/expert_metier/expert_ite.py` (Skill #26) |

---

## 1. Three mandatory files per skill

Every skill is exactly three colocated files:

```
backend/synorix/skills/<category>/
├── <name>.py              # Pydantic Input/Output + Skill subclass + @register
├── prompts/
│   └── <name>.md          # system prompt (pure Markdown, no frontmatter)
└── test_<name>.py         # pytest: structure test + metadata test
```

- `<name>` uses **snake_case** for Python (`expert_ite`), the registry `name` attribute uses **kebab-case** (`expert-ite`).
- The `.md` prompt lives in a `prompts/` subfolder next to the `.py`.
- No skill ships without its test file. **Tests must pass before commit.**

---

## 2. The 9 authorised categories

Pipeline-aware (decision A3). A skill belongs to exactly one:

| Category (Python pkg) | Pipeline role |
|---|---|
| `upload` | Step 1 — DCE upload / classification |
| `lots` | Step 2 — lot detection |
| `extraction` | Step 3 — requirement / alert extraction |
| `expert_metier` | Step 3/4 — corps-de-métier experts (10 trades) |
| `memoire` | Step 4 — technical memo generation |
| `verification` | Step 5 — final verification / scoring |
| `export` | Step 6 — export / submission |
| `sidebar` | Sidebar workspaces (entreprise / références / coffre-fort / library) |
| `chatbot` | Synorix Coach |

> Note: the registry's prose "Catégorie" field (e.g., "Coaching") is a doc-level taxonomy. The **code** `category` attribute uses one of these 9 pipeline-aware values.

---

## 3. The 3 authorised models

| Model ID | When to use | Cost |
|---|---|---|
| `claude-haiku-4-5` | Deterministic classification, simple extraction, calculs simples on a strong signal | lowest |
| `claude-sonnet-4-6` | Multi-document reasoning, nuanced extraction, bounded generation, corps-de-métier experts | medium |
| `claude-opus-4-7` | Long-form memo composition only (Step 4 writers), high-stakes synthesis | highest |

**Default to Haiku.** Step up only when the task genuinely needs reasoning. Opus is reserved for memo generation.

> Exact date-suffixed API identifiers are confirmed at implementation time against Anthropic's models documentation (see ARCHITECTURE §11.2). Store the resolved IDs in one place.

---

## 4. Skill attribute contract

```python
@register
class MySkill(Skill):
    # REQUIRED
    name = "my-skill"                       # kebab-case, unique in registry
    category = "expert-metier"              # one of the 9 categories
    model = "claude-sonnet-4-6"             # one of the 3 models
    version = "1"                           # bump on any prompt change
    system_prompt_path = "prompts/my_skill.md"   # relative to this .py file

    # OPTIONAL (Synorix v2.1 metadata — used by registry/observability)
    notebook_sources = ["N4", "N3"]         # which NotebookLM notebooks ground this skill
    pipeline_step = 3                        # int | str | None
    differentiateur = 0                      # 0 if standard, else 1-15 (PRD §1.7 D-id)
```

- `Input` subclasses `SkillInput` (always carries `project_id`).
- `Output` subclasses `SkillOutput`.
- Both are Pydantic v2 models — **validated on both sides** (`Output.model_validate(raw)`).
- `system_prompt` is loaded from disk relative to the module file (cwd-independent).

---

## 5. The prompt Markdown format

- **Pure Markdown. No YAML frontmatter.** (Frontmatter is for Claude Code skills, not for these system prompts.)
- Recommended sections:
  1. **Persona** — who the model embodies (e.g., "expert ITE, 20 ans, maîtrise CPT/DTU/AQC")
  2. **Référentiels à citer obligatoirement** — the exact norms/articles
  3. **Méthodologie validée** — phase-by-phase, with figures
  4. **Points de vigilance / pathologies** — with sinistralité figures
  5. **Phrases-types** — winning formulations for the memo
  6. **Contrôles & livrables**
  7. **Champs à laisser vides** — what the model must NEVER invent (`[À COMPLÉTER]`)
  8. **Format de sortie** — the JSON shape expected
- Every block of borrowed expertise carries an HTML-comment source marker:
  ```markdown
  <!-- Source: NotebookLM N4, validé 9.7/10, 27/5/26 -->
  ```
- Preserve all figures and references **verbatim** (12 plots/m² stays 12 plots/m², never "une dizaine"; DTU/CPT/CCP references stay identical).

---

## 6. JSON output rule

The system prompt MUST instruct the model to **return only JSON conforming to the skill's `Output` Pydantic schema** — no prose, no markdown fences. The client parses the first text block as JSON; the skill then runs `Output.model_validate(raw)`. If the schema fails, that is a skill bug to fix (anti-hallucination: fail loudly, never paper over).

---

## 7. Tests are mandatory

Minimum two tests per skill:

1. **Structure test** (`@pytest.mark.asyncio`) — mock the `Client`, return a fake schema-conform dict, assert `run()` produces a valid `Output` with the expected invariants (e.g., ≥ 4 phases, cites CPT 3035).
2. **Metadata test** (sync) — assert `name`, `category`, `model`, `notebook_sources`, `pipeline_step` are correct.

Run from the repo root or `backend/`:

```bash
cd /mnt/c/saas-ao/backend
./venv/bin/python -m pytest synorix/skills/<category>/test_<name>.py -v
```

> The skills layer is async-first; `pytest-asyncio` is a required dev dependency (added to `requirements.txt`). The structure test reads the **real** prompt file, so the prompt must exist and be non-empty before tests pass.

---

## 8. Registration

The `@register` decorator on the skill class adds it to `registry.SKILLS` at import time. To guarantee the module is imported at backend startup, add to the category's `__init__.py`:

```python
# backend/synorix/skills/expert_metier/__init__.py
from synorix.skills.expert_metier.expert_ite import ExpertITE  # noqa: F401
```

---

## 9. Build flow (NotebookLM static snapshot)

Per ARCHITECTURE §6.6 — NotebookLM is consulted **only at build time**:

1. Read the skill's registry entry (`SKILLS_REGISTRY_V2.md`).
2. Query the mapped notebook(s) with **micro-questions** (NotebookLM Free truncates ≳ 1500-2000 tokens — one question per section).
3. Capture raw answers in `docs/notebook-extracts/skill-<N>-<name>-raw.md` (timestamped, for audit).
4. **Reformulate** into `prompts/<name>.md` (never copy-paste raw), preserving figures & references verbatim, with source markers.
5. Write `<name>.py` (Input/Output/Skill/@register) and `test_<name>.py`.
6. `pytest` green → bump `version` → register in category `__init__.py`.
7. At runtime, NotebookLM is never called.

---

## 10. Worked example

See the pilot skill **#26 `expert-ite`**:

- `backend/synorix/skills/expert_metier/expert_ite.py`
- `backend/synorix/skills/expert_metier/prompts/expert_ite.md`
- `backend/synorix/skills/expert_metier/test_expert_ite.py`
- Raw NotebookLM capture: `docs/notebook-extracts/skill-26-expert-ite-raw.md`

---

*End of Skill Template — Synorix v2.1*
