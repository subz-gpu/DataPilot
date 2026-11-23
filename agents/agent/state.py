from __future__ import annotations

from dataclasses import dataclass, field

from sandbox import ExecutionResult


@dataclass
class Attempt:
    number: int
    code: str
    execution: ExecutionResult
    verdict: dict | None = None  # critic verdict, None if not reviewed

    def to_dict(self) -> dict:
        return {
            "number": self.number,
            "code": self.code,
            "execution": self.execution.to_dict(),
            "verdict": self.verdict,
        }


@dataclass
class StepRecord:
    index: int
    title: str
    goal: str
    # approved | accepted_with_issues | failed | skipped | pending
    status: str = "pending"
    attempts: list[Attempt] = field(default_factory=list)
    output: str = ""  # stdout of the attempt that was kept
    code: str = ""  # code of the attempt that was kept
    caveats: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "index": self.index,
            "title": self.title,
            "goal": self.goal,
            "status": self.status,
            "output": self.output,
            "code": self.code,
            "caveats": self.caveats,
            "attempts": [a.to_dict() for a in self.attempts],
        }


@dataclass
class RunResult:
    objective: str
    profile: dict
    plan: list[dict]
    steps: list[StepRecord]
    report: str
    llm_calls: int
    output_dir: str
    files: list[str]
    stop_reason: str | None = None

    @property
    def ok(self) -> bool:
        return bool(self.steps) and all(
            s.status in ("approved", "accepted_with_issues") for s in self.steps
        )

    def to_dict(self) -> dict:
        return {
            "objective": self.objective,
            "profile": self.profile,
            "plan": self.plan,
            "steps": [s.to_dict() for s in self.steps],
            "report": self.report,
            "llm_calls": self.llm_calls,
            "output_dir": self.output_dir,
            "files": self.files,
            "stop_reason": self.stop_reason,
        }
