from __future__ import annotations

from typing import Protocol


class LLMClient(Protocol):
    """Anything with generate(system, prompt) -> str can drive the agents."""

    calls: int

    def generate(self, system: str, prompt: str) -> str: ...
