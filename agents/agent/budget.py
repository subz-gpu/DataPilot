from __future__ import annotations


class BudgetExceeded(Exception):
    """Raised when a run tries to use more LLM calls than allowed."""


class BudgetedLLM:
    """Wraps an LLM client and enforces a hard cap on calls per run.

    The free Gemini tier has tight daily limits, so every run gets a budget.
    """

    def __init__(self, inner, max_calls: int):
        self.inner = inner
        self.max_calls = max_calls
        self.calls = 0

    @property
    def remaining(self) -> int:
        return self.max_calls - self.calls

    def generate(self, system: str, prompt: str) -> str:
        if self.calls >= self.max_calls:
            raise BudgetExceeded(f"LLM call budget of {self.max_calls} reached")
        self.calls += 1
        return self.inner.generate(system, prompt)
