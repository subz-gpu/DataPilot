from __future__ import annotations

from llm import LLMClient

from .jsonutil import clean_paths
from .loop_prompts import CODER_SYSTEM, CODER_USER, FEEDBACK_ERROR, FEEDBACK_REVIEW
from .single_pass import extract_code
from .state import StepRecord

MAX_PRIOR_CHARS = 1200


def _format_plan(plan: list[dict]) -> str:
    return "\n".join(f"{i}. {s['title']}: {s['goal']}" for i, s in enumerate(plan, 1))


def _format_prior(prior: list[StepRecord]) -> str:
    if not prior:
        return "(none yet - this is the first step)"
    blocks = []
    for r in prior:
        out = clean_paths(r.output[:MAX_PRIOR_CHARS]) if r.output else "(no output)"
        blocks.append(f"Step {r.index} [{r.status}] {r.title}:\n{out}")
    return "\n\n".join(blocks)


def write_step_code(
    llm: LLMClient,
    *,
    objective: str,
    profile_text: str,
    plan: list[dict],
    step_index: int,
    prior_steps: list[StepRecord],
    out_files: list[str],
    error_feedback: tuple[str, str] | None = None,  # (previous_code, error_text)
    review_feedback: tuple[str, list[str], str] | None = None,  # (code, issues, fix)
) -> str:
    step = plan[step_index - 1]
    feedback = ""
    if error_feedback:
        code, err = error_feedback
        feedback = FEEDBACK_ERROR.format(code=code, error=err)
    elif review_feedback:
        code, issues, fix = review_feedback
        feedback = FEEDBACK_REVIEW.format(
            code=code, issues="\n".join(f"- {i}" for i in issues) or "- (none listed)", fix=fix or "(none)"
        )
    reply = llm.generate(
        CODER_SYSTEM,
        CODER_USER.format(
            objective=objective,
            profile=profile_text,
            plan=_format_plan(plan),
            prior=_format_prior(prior_steps),
            files=", ".join(out_files) if out_files else "(none)",
            index=step_index,
            total=len(plan),
            title=step["title"],
            goal=step["goal"],
            feedback=feedback,
        ),
    )
    return extract_code(reply)
