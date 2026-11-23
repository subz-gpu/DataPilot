from __future__ import annotations

from llm import LLMClient

from .jsonutil import clean_paths
from .loop_prompts import REPORTER_SYSTEM, REPORTER_USER
from .state import StepRecord

MAX_STEP_OUTPUT = 2500


def _format_steps(records: list[StepRecord]) -> str:
    blocks = []
    for r in records:
        head = f"### Step {r.index}: {r.title} [status: {r.status}]\nGoal: {r.goal}"
        body = clean_paths(r.output[:MAX_STEP_OUTPUT]) if r.output else "(no verified output)"
        cav = ""
        if r.caveats:
            cav = "\nCaveats:\n" + "\n".join(f"- {c}" for c in r.caveats)
        blocks.append(f"{head}\nOutput:\n{body}{cav}")
    return "\n\n".join(blocks)


def write_report(
    llm: LLMClient,
    objective: str,
    profile: dict,
    records: list[StepRecord],
    files: list[str],
    stop_reason: str | None,
) -> str:
    note = f"\nNOTE: the run stopped early ({stop_reason}). Say so in the report." if stop_reason else ""
    return llm.generate(
        REPORTER_SYSTEM,
        REPORTER_USER.format(
            objective=objective,
            rows=profile.get("rows"),
            cols=profile.get("columns"),
            steps=_format_steps(records),
            files=", ".join(files) if files else "(none)",
            note=note,
        ),
    ).strip()


def fallback_report(
    objective: str, records: list[StepRecord], files: list[str], stop_reason: str | None
) -> str:
    """Deterministic report used when the LLM cannot write one (quota, errors)."""
    lines = [
        "## Summary",
        f"Objective: {objective}",
        "",
        "_The report writer was unavailable, so this is a raw summary of the verified step outputs._",
    ]
    if stop_reason:
        lines += ["", f"**Run stopped early:** {stop_reason}"]
    lines += ["", "## Step results"]
    for r in records:
        lines += ["", f"### Step {r.index}: {r.title} ({r.status})", "```", r.output.strip() or "(no output)", "```"]
        for c in r.caveats:
            lines.append(f"- Caveat: {c}")
    if files:
        lines += ["", "## Files", *[f"- {f}" for f in files]]
    return "\n".join(lines)
