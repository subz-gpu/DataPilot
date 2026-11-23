"""Step 3: plan -> (code -> run -> critique -> retry) per step -> report.

A small explicit state machine. Every stage emits an event so the API layer
(Step 4) can stream progress to the web and mobile clients.
"""
from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Callable

from llm import LLMClient, LLMError
from profiler import format_profile_for_prompt, profile_dataset
from sandbox import run_code
from sandbox.loader import LOADER_CODE

from .budget import BudgetedLLM, BudgetExceeded
from .coder import write_step_code
from .critic import review
from .planner import make_plan
from .reporter import fallback_report, write_report
from .state import Attempt, RunResult, StepRecord

RESERVE_FOR_REPORT = 1  # always keep one LLM call for the final report


class _OutOfBudget(Exception):
    pass


def _list_files(out_dir: Path) -> list[str]:
    return sorted(
        str(p.relative_to(out_dir)).replace("\\", "/")
        for p in out_dir.rglob("*")
        if p.is_file()
    )


def run_analysis(
    dataset_path: str | Path,
    objective: str,
    llm: LLMClient,
    output_dir: str | Path | None = None,
    *,
    max_steps: int = 5,
    max_attempts: int = 3,
    max_llm_calls: int = 30,
    timeout_s: int = 60,
    on_event: Callable[[str, dict], None] | None = None,
) -> RunResult:
    def emit(kind: str, **data) -> None:
        if on_event:
            on_event(kind, data)

    budget = BudgetedLLM(llm, max_llm_calls)
    out_dir = Path(output_dir) if output_dir else Path(tempfile.mkdtemp(prefix="datapilot-run-"))
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Profile (no LLM call)
    emit("profiling_started")
    profile = profile_dataset(dataset_path)
    profile_text = format_profile_for_prompt(profile)
    emit("profile_ready", profile=profile)

    records: list[StepRecord] = []
    stop_reason: str | None = None
    plan: list[dict] = []

    # 2. Plan
    try:
        emit("planning_started")
        plan = make_plan(budget, profile_text, objective, max_steps)
    except (LLMError, BudgetExceeded) as e:
        stop_reason = f"planning failed: {e}"
        plan = []
    emit("plan_created", plan=plan)

    # 3. Execute steps
    for i, step in enumerate(plan, 1):
        rec = StepRecord(index=i, title=step["title"], goal=step["goal"])
        records.append(rec)
        if stop_reason:
            rec.status = "skipped"
            emit("step_skipped", index=i, title=rec.title, reason=stop_reason)
            continue

        emit("step_started", index=i, total=len(plan), title=rec.title, goal=rec.goal)
        reason = _run_step(
            rec, plan, records[:-1], objective, profile_text, dataset_path,
            out_dir, budget, max_attempts, timeout_s, emit,
        )
        if reason:
            stop_reason = reason
        emit("step_done", index=i, title=rec.title, status=rec.status, caveats=rec.caveats)

    # 4. Report
    files = _list_files(out_dir)
    emit("reporting_started")
    try:
        if not records:
            raise LLMError("no steps were run")
        report = write_report(budget, objective, profile, records, files, stop_reason)
        if not report:
            raise LLMError("empty report")
    except (LLMError, BudgetExceeded):
        report = fallback_report(objective, records, files, stop_reason)
    emit("report_ready", report=report)

    result = RunResult(
        objective=objective,
        profile=profile,
        plan=plan,
        steps=records,
        report=report,
        llm_calls=budget.calls,
        output_dir=str(out_dir),
        files=files,
        stop_reason=stop_reason,
    )
    emit("run_finished", ok=result.ok, llm_calls=result.llm_calls, stop_reason=stop_reason)
    return result


def _run_step(
    rec: StepRecord,
    plan: list[dict],
    prior: list[StepRecord],
    objective: str,
    profile_text: str,
    dataset_path,
    out_dir: Path,
    budget: BudgetedLLM,
    max_attempts: int,
    timeout_s: int,
    emit,
) -> str | None:
    """Run one step with retries. Returns a stop reason if the whole run must stop."""
    stop: str | None = None
    best: Attempt | None = None  # last attempt whose code ran successfully
    last_error = ""
    error_fb: tuple[str, str] | None = None
    review_fb: tuple[str, list[str], str] | None = None
    approved = False

    try:
        for n in range(1, max_attempts + 1):
            if budget.remaining <= RESERVE_FOR_REPORT:
                raise _OutOfBudget()

            emit("attempt_started", index=rec.index, attempt=n)
            code = write_step_code(
                budget,
                objective=objective,
                profile_text=profile_text,
                plan=plan,
                step_index=rec.index,
                prior_steps=prior,
                out_files=_list_files(out_dir),
                error_feedback=error_fb,
                review_feedback=review_fb,
            )
            emit("code_generated", index=rec.index, attempt=n, code=code)

            emit("execution_started", index=rec.index, attempt=n)
            execution = run_code(
                LOADER_CODE + "\n" + code, dataset_path, output_dir=out_dir, timeout_s=timeout_s
            )
            attempt = Attempt(number=n, code=code, execution=execution)
            rec.attempts.append(attempt)
            emit("execution_result", index=rec.index, attempt=n, execution=execution.to_dict())

            if not execution.success:
                # A crash needs no critic: send the error straight back to the coder.
                last_error = execution.summary_for_llm()
                error_fb, review_fb = (code, last_error), None
                emit("retry", index=rec.index, attempt=n, reason="execution failed")
                continue

            best = attempt
            error_fb = None

            if budget.remaining <= RESERVE_FOR_REPORT:
                attempt.verdict = None
                rec.caveats = ["Not reviewed by the critic because the LLM call budget ran out."]
                stop = "LLM call budget reached"
                break

            verdict = review(
                budget, objective, rec.goal, profile_text, code, execution.summary_for_llm()
            )
            attempt.verdict = verdict.to_dict()
            emit("critic_verdict", index=rec.index, attempt=n, verdict=verdict.to_dict())

            if verdict.approve:
                approved = True
                rec.caveats = verdict.caveats
                break

            review_fb = (code, verdict.issues, verdict.fix_instructions)
            rec.caveats = verdict.issues + verdict.caveats
            emit("retry", index=rec.index, attempt=n, reason="critic requested changes")

    except _OutOfBudget:
        stop = "LLM call budget reached"
    except BudgetExceeded:
        stop = "LLM call budget reached"
    except LLMError as e:
        stop = f"LLM error: {e}"

    if approved and best:
        rec.status = "approved"
    elif best:
        rec.status = "accepted_with_issues"
        if not rec.caveats:
            rec.caveats = ["The result ran but could not be fully verified."]
        if best.verdict and not best.verdict.get("approve", True):
            rec.caveats = [f"Unresolved reviewer concern: {c}" for c in rec.caveats]
    else:
        rec.status = "failed"
        rec.output = last_error or "(no output)"
        rec.caveats = ["No working script was produced for this step."]
    if best:
        rec.output = best.execution.stdout
        rec.code = best.code
    return stop
