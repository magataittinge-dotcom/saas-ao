"""
Skill loader — reads .claude/skills/ SKILL.md files and injects them into backend prompts.

The .claude/skills/ directory contains domain knowledge written for the Claude Code CLI.
This module loads their content so it can also enrich the Claude API prompts used by the
backend (DCE analysis, mémoire generation, etc.).
"""

import pathlib
import functools

_SKILLS_ROOT = pathlib.Path(__file__).resolve().parents[2] / ".claude" / "skills"


@functools.lru_cache(maxsize=32)
def load_skill(skill_name: str) -> str:
    """Load a skill's SKILL.md content, stripping YAML frontmatter.

    Returns the markdown body (everything after the closing '---'),
    or empty string if skill not found.
    """
    skill_path = _SKILLS_ROOT / skill_name / "SKILL.md"
    if not skill_path.is_file():
        return ""

    text = skill_path.read_text(encoding="utf-8")

    # Strip YAML frontmatter (--- ... ---)
    if text.startswith("---"):
        end = text.find("---", 3)
        if end != -1:
            text = text[end + 3:].lstrip("\n")

    return text


@functools.lru_cache(maxsize=32)
def load_skill_reference(skill_name: str, ref_filename: str) -> str:
    """Load a reference file from a skill's references/ directory.

    Returns file content or empty string if not found.
    """
    ref_path = _SKILLS_ROOT / skill_name / "references" / ref_filename
    if not ref_path.is_file():
        return ""
    return ref_path.read_text(encoding="utf-8")


@functools.lru_cache(maxsize=64)
def load_skill_section(skill_name: str, section_header: str) -> str:
    """Extract a specific markdown section from a skill by header match.

    Finds a heading (any level) containing *section_header* (case-insensitive)
    and returns everything until the next heading at the same or higher level.
    """
    full = load_skill(skill_name)
    if not full:
        return ""

    lines = full.split("\n")
    header_lower = section_header.lower()

    capturing = False
    capture_level = 0
    result_lines: list[str] = []

    for line in lines:
        if line.startswith("#"):
            level = len(line) - len(line.lstrip("#"))
            if capturing and level <= capture_level:
                break  # next section at same or higher level
            if not capturing and header_lower in line.lower():
                capturing = True
                capture_level = level
            if capturing:
                result_lines.append(line)
        elif capturing:
            result_lines.append(line)

    return "\n".join(result_lines).strip()


def load_skills_bundle(skill_names: list[str]) -> str:
    """Load multiple skills and concatenate them with separators.

    Returns combined text, or empty string if no skills found.
    """
    parts = []
    for name in skill_names:
        content = load_skill(name)
        if content:
            parts.append(f"━━━ RÉFÉRENTIEL : {name} ━━━\n{content}")

    return "\n\n".join(parts)
