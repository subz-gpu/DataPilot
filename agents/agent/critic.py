from __future__ import annotations

from dataclasses import asdict, dataclass, field

from llm import LLMClient

from .jsonutil import extract_json
from .loop_prompts import CRITIC_SYSTEM, CRITIC_USER


@dataclass
class Verdict:
    approve: bool
    issues: list[str] = field(default_factory=list)
    fix_instructions: str = ""
    caveats: list[str] = field(default_factory=list)
    parsed: bool = True

    def to_dict(self) -> dict:
        return asdict(self)


def _as_list(x) -> list[str]:
    if isinstance(x, list):
        return [str(i) for i in x if str(i).strip()]
    if isinstance(x, str) and x.strip():
        return [x.strip()]
    return []


def review(
    llm: LLMClient,
    objective: str,
    goal: str,
    profile_text: str,
    code: str,
    execution_summary: str,
) -> Verdict:
    reply = llm.generate(
        CRITIC_SYSTEM,
        CRITIC_USER.format(
            objective=objective,
            profile=profile_text,
            goal=goal,
            code=code,
            execution=execution_summary,
        ),
    )
    data = extract_json(reply)
    if not isinstance(data, dict) or "verdict" not in data:
        # Don't burn another call; accept but say the review was unusable.
        return Verdict(
            approve=True,
            caveats=["The automated reviewer's reply could not be parsed, so this result was not independently checked."],
            parsed=False,
        )
    return Verdict(
        approve=str(data.get("verdict", "")).strip().lower() != "revise",
        issues=_as_list(data.get("issues")),
        fix_instructions=str(data.get("fix_instructions") or "").strip(),
        caveats=_as_list(data.get("caveats_for_report")),
    )
