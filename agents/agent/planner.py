from __future__ import annotations

from llm import LLMClient

from .jsonutil import extract_json
from .loop_prompts import PLANNER_SYSTEM, PLANNER_USER


def make_plan(llm: LLMClient, profile_text: str, objective: str, max_steps: int) -> list[dict]:
    """Ask the LLM for a plan. Falls back to a single step if the reply is unusable."""
    reply = llm.generate(
        PLANNER_SYSTEM.replace("<<MAX_STEPS>>", str(max_steps)),
        PLANNER_USER.format(profile=profile_text, objective=objective),
    )
    data = extract_json(reply)
    steps: list[dict] = []
    if isinstance(data, dict) and isinstance(data.get("steps"), list):
        for s in data["steps"][:max_steps]:
            if isinstance(s, dict) and s.get("goal"):
                steps.append(
                    {
                        "title": str(s.get("title") or s["goal"])[:80],
                        "goal": str(s["goal"]),
                    }
                )
    return steps or [{"title": "Answer the objective", "goal": objective}]
