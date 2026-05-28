"""AI client wrapper — abstracts the Anthropic API for skills.

This thin wrapper exists so skills don't directly depend on the Anthropic SDK
internals. Enables mocking in tests, switching SDK versions, or routing to
different providers later.
"""

from __future__ import annotations

import json
from typing import Any, TypeVar

from anthropic import AsyncAnthropic
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class Client:
    """Anthropic API client wrapper for Synorix skills."""

    def __init__(self, api_key: str | None = None):
        # AsyncAnthropic reads ANTHROPIC_API_KEY from env if api_key is None
        self._anthropic = AsyncAnthropic(api_key=api_key)

    async def complete(
        self,
        model: str,
        system_prompt: str,
        user_prompt: str,
        *,
        schema: type[T],
        max_tokens: int = 4096,
        temperature: float = 0.0,
    ) -> dict[str, Any]:
        """Run a completion and return raw dict (caller validates with schema).

        The system prompt instructs the model to return JSON conforming to the
        skill's Output schema. We parse the first text block as JSON here; the
        caller is responsible for `Output.model_validate(...)`.
        """
        response = await self._anthropic.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        text = response.content[0].text
        return json.loads(text)
