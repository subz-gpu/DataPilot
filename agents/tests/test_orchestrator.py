"""Agent-loop tests with a scripted fake LLM (no API calls). Need Docker + image."""
import pytest

from agent import run_analysis
from sandbox import sandbox_ready

pytestmark = pytest.mark.skipif(
    not sandbox_ready(), reason="Docker or sandbox image missing"
)

PLAN_1 = '{"steps": [{"title": "Mean age", "goal": "Compute the mean age"}]}'
GOOD = "```python\nprint(df['age'].mean())\n```"
BAD = "```python\nprint(df['missing_col'])\n```"
APPROVE = '{"verdict": "approve", "issues": [], "fix_instructions": "", "caveats_for_report": []}'
REVISE = '{"verdict": "revise", "issues": ["row count not reported"], "fix_instructions": "print rows used", "caveats_for_report": []}'


class FakeLLM:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = 0
        self.prompts = []

    def generate(self, system, prompt):
        self.calls += 1
        self.prompts.append(prompt)
        return self.replies.pop(0)


@pytest.fixture
def csv_file(tmp_path):
    p = tmp_path / "people.csv"
    p.write_text("name,age\nAsha,30\nBen,25\nChitra,41\n")
    return p


def test_error_is_fixed_on_retry(csv_file, tmp_path):
    llm = FakeLLM([PLAN_1, BAD, GOOD, APPROVE, "REPORT"])
    r = run_analysis(csv_file, "mean age?", llm, tmp_path / "o")
    step = r.steps[0]
    assert step.status == "approved" and len(step.attempts) == 2
    assert "32" in step.output
    assert r.report == "REPORT" and r.llm_calls == 5 and r.ok
    # the retry prompt must contain the real traceback
    assert "KeyError" in llm.prompts[2]


def test_critic_can_force_a_revision(csv_file, tmp_path):
    llm = FakeLLM([PLAN_1, GOOD, REVISE, GOOD, APPROVE, "REPORT"])
    r = run_analysis(csv_file, "mean age?", llm, tmp_path / "o")
    assert r.steps[0].status == "approved" and len(r.steps[0].attempts) == 2
    assert "row count not reported" in llm.prompts[3]


def test_unresolved_critic_concerns_become_caveats(csv_file, tmp_path):
    llm = FakeLLM([PLAN_1, GOOD, REVISE, GOOD, REVISE, GOOD, REVISE, "REPORT"])
    r = run_analysis(csv_file, "q", llm, tmp_path / "o", max_attempts=3)
    step = r.steps[0]
    assert step.status == "accepted_with_issues"
    assert any("row count not reported" in c for c in step.caveats)


def test_all_attempts_failing_marks_step_failed_but_still_reports(csv_file, tmp_path):
    llm = FakeLLM([PLAN_1, BAD, BAD, BAD, "REPORT"])
    r = run_analysis(csv_file, "q", llm, tmp_path / "o", max_attempts=3)
    assert r.steps[0].status == "failed" and not r.ok
    assert r.report == "REPORT"


def test_call_budget_is_enforced_and_report_still_written(csv_file, tmp_path):
    # budget 3: plan(1) + code(2) + report(3); critic is skipped
    llm = FakeLLM([PLAN_1, GOOD, "REPORT"])
    r = run_analysis(csv_file, "q", llm, tmp_path / "o", max_llm_calls=3)
    assert r.llm_calls == 3 and r.report == "REPORT"
    assert r.steps[0].status == "accepted_with_issues"
    assert r.stop_reason and "budget" in r.stop_reason


def test_garbage_plan_falls_back_to_single_step(csv_file, tmp_path):
    llm = FakeLLM(["no json here", GOOD, APPROVE, "REPORT"])
    r = run_analysis(csv_file, "mean age?", llm, tmp_path / "o")
    assert len(r.steps) == 1 and r.steps[0].status == "approved"


def test_events_cover_the_whole_flow(csv_file, tmp_path):
    seen = []
    llm = FakeLLM([PLAN_1, GOOD, APPROVE, "REPORT"])
    run_analysis(csv_file, "q", llm, tmp_path / "o", on_event=lambda k, d: seen.append(k))
    for expected in ("plan_created", "step_started", "code_generated", "execution_result",
                     "critic_verdict", "step_done", "report_ready", "run_finished"):
        assert expected in seen
