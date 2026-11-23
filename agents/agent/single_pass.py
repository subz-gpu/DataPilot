"""Step 2: one pass of profile -> write code -> run -> answer. No retries yet."""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from llm import LLMClient
from profiler import format_profile_for_prompt, profile_dataset
from sandbox import ExecutionResult, run_code

from sandbox.loader import LOADER_CODE
from .prompts import ANSWER_SYSTEM, ANSWER_USER, CODER_SYSTEM, CODER_USER

_FENCE = re.compile(r"```(?:python|py)?\s*\n(.*?)```", re.DOTALL | re.IGNORECASE)


def extract_code(text: str) -> str:
    """Pull the Python out of an LLM reply (handles fenced and unfenced replies)."""
    m = _FENCE.search(text)
    if m:
        return m.group(1).strip()
    return text.strip()


@dataclass
class AnalysisResult:
    question: str
    profile: dict
    code: str
    execution: ExecutionResult
    answer: str
    llm_calls: int
    output_dir: str


def analyze(
    dataset_path: str | Path,
    question: str,
    llm: LLMClient,
    output_dir: str | Path | None = None,
    timeout_s: int = 60,
    on_event: Callable[[str, dict], None] | None = None,
) -> AnalysisResult:
    def emit(kind: str, **data) -> None:
        if on_event:
            on_event(kind, data)

    calls_before = llm.calls

    emit("profiling_started")
    profile = profile_dataset(dataset_path)
    emit("profile_ready", profile=profile)

    emit("coding_started")
    reply = llm.generate(
        CODER_SYSTEM,
        CODER_USER.format(profile=format_profile_for_prompt(profile), question=question),
    )
    code = extract_code(reply)
    emit("code_generated", code=code)

    emit("execution_started")
    execution = run_code(
        LOADER_CODE + "\n" + code,
        dataset_path,
        output_dir=output_dir,
        timeout_s=timeout_s,
    )
    emit("execution_result", execution=execution.to_dict())

    emit("answering_started")
    answer = llm.generate(
        ANSWER_SYSTEM,
        ANSWER_USER.format(
            question=question, code=code, execution=execution.summary_for_llm()
        ),
    )
    emit("answer_ready", answer=answer)

    return AnalysisResult(
        question=question,
        profile=profile,
        code=code,
        execution=execution,
        answer=answer,
        llm_calls=llm.calls - calls_before,
        output_dir=execution.output_dir,
    )
