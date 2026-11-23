"""Gemini client with call spacing and retry/backoff for free-tier limits."""
from __future__ import annotations

import threading
import time

from google import genai
from google.genai import types


class LLMError(RuntimeError):
    pass


class GeminiClient:
    def __init__(
        self,
        api_key: str,
        model: str,
        min_interval_s: float = 5.0,
        max_retries: int = 4,
    ):
        if not api_key:
            raise LLMError("GEMINI_API_KEY is not set. Add it to your .env file.")
        self.client = genai.Client(api_key=api_key)
        self.model = model
        self.min_interval_s = min_interval_s
        self.max_retries = max_retries
        self.calls = 0
        self._last_call = 0.0
        self._lock = threading.Lock()

    def _wait_turn(self) -> None:
        """Space calls out, even when several runs share this client."""
        with self._lock:
            gap = time.monotonic() - self._last_call
            if gap < self.min_interval_s:
                time.sleep(self.min_interval_s - gap)
            self._last_call = time.monotonic()

    def generate(self, system: str, prompt: str) -> str:
        last_err: Exception | None = None
        for attempt in range(self.max_retries + 1):
            self._wait_turn()
            try:
                resp = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=types.GenerateContentConfig(system_instruction=system),
                )
                with self._lock:
                    self.calls += 1
                return resp.text or ""
            except Exception as e:  # SDK raises APIError subclasses
                code = getattr(e, "code", None)
                last_err = e
                if code in (429, 500, 503) and attempt < self.max_retries:
                    time.sleep(min(10 * (2**attempt), 60))
                    continue
                if code == 429:
                    raise LLMError(
                        "Rate limit / daily quota hit (429). On the free tier, wait a "
                        "minute, or switch GEMINI_MODEL to a Flash-Lite model with a "
                        "higher daily limit."
                    ) from e
                raise LLMError(f"Gemini call failed: {e}") from e
        raise LLMError(f"Gemini call failed after retries: {last_err}")
