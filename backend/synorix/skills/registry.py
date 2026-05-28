"""Skill registry — maps skill_name to Skill class.

The orchestrator (Step 3, Step 4, etc.) calls skills BY NAME via `invoke()`,
never via direct import. This enables A/B testing model assignments or prompt
variants without touching orchestration code.
"""

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput

# Registry of all skills. Populated as skills are created.
# Each entry: skill_name -> Skill class
SKILLS: dict[str, type[Skill]] = {
    # Populated by individual skill modules at import time via @register.
    # Example after creating expert-ite:
    #   "expert-ite": ExpertITE,
}


def register(skill_cls: type[Skill]) -> type[Skill]:
    """Decorator: register a skill class in SKILLS by its `name`."""
    SKILLS[skill_cls.name] = skill_cls
    return skill_cls


async def invoke(name: str, inp: SkillInput, *, client: Client) -> SkillOutput:
    """Invoke a skill by name with a validated input."""
    if name not in SKILLS:
        raise KeyError(
            f"Skill '{name}' is not registered. Available: {sorted(SKILLS.keys())}"
        )
    skill = SKILLS[name]()
    return await skill.run(inp, client=client)
