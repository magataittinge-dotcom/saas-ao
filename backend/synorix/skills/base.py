"""Skill base classes — Synorix v2.1

Every Synorix skill inherits from `Skill` and declares Pydantic `Input` and
`Output` types. The skill loads its system prompt from a Markdown file colocated
with the Python module (prompts/<name>.md, path relative to the skill module).

Runtime contract:
- The orchestrator calls `invoke(skill_name, input_dict)` from registry.py
- The skill builds the prompt, calls the AI client, validates the output
- Outputs are guaranteed conform to the declared Pydantic schema
"""

from __future__ import annotations

import inspect
from abc import ABC, abstractmethod
from pathlib import Path
from typing import ClassVar

from pydantic import BaseModel

from synorix.ai.client import Client


class SkillInput(BaseModel):
    """Base class for skill inputs. Each skill subclasses with concrete fields."""

    project_id: int


class SkillOutput(BaseModel):
    """Base class for skill outputs. Each skill subclasses with concrete fields."""

    pass


class Skill(ABC):
    """Base class for all Synorix skills.

    Subclasses MUST set: name, category, model, version, system_prompt_path.
    Subclasses MAY set: notebook_sources, pipeline_step, differentiateur.
    """

    # Required class attributes
    name: ClassVar[str]
    category: ClassVar[str]
    model: ClassVar[str]  # claude-haiku-4-5 | claude-sonnet-4-6 | claude-opus-4-7
    version: ClassVar[str]
    system_prompt_path: ClassVar[str]  # relative to the skill .py file

    # Optional Synorix v2.1 metadata (used by registry/observability)
    notebook_sources: ClassVar[list[str]] = []  # e.g. ["N4", "N3"]
    pipeline_step: ClassVar[int | str | None] = None
    differentiateur: ClassVar[int] = 0  # 0 if standard, else 1-15

    @property
    def system_prompt(self) -> str:
        """Loads and caches the system prompt from disk.

        The path is resolved relative to the skill module's own file location
        (via `inspect.getfile`), so it works regardless of the current working
        directory — whether pytest runs from the repo root or from `backend/`.
        """
        if not hasattr(self, "_cached_prompt"):
            module_dir = Path(inspect.getfile(type(self))).parent
            prompt_path = module_dir / self.system_prompt_path
            self._cached_prompt = prompt_path.read_text(encoding="utf-8")
        return self._cached_prompt

    @abstractmethod
    async def run(self, inp: SkillInput, *, client: Client) -> SkillOutput:
        """Execute the skill against the given input. Must be implemented per skill."""
        ...
