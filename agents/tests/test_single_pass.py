"""Pipeline tests with a fake LLM (no API calls, no quota used)."""
import pytest

from agent import analyze
from sandbox import sandbox_ready

pytestmark = pytest.mark.skipif(
    not sandbox_ready(), reason="Docker or sandbox image missing"
)


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


def test_happy_path(csv_file, tmp_path):
    llm = FakeLLM(["```python\nprint(df['age'].mean())\n```", "The mean age is 32."])
    r = analyze(csv_file, "What is the mean age?", llm, tmp_path / "out")
    assert r.execution.success, r.execution.stderr
    assert "32" in r.execution.stdout
    assert r.answer == "The mean age is 32."
    assert r.llm_calls == 2
    # the second LLM call must have been given the real execution output
    assert "32" in llm.prompts[1]


def test_failed_code_is_reported_not_hidden(csv_file, tmp_path):
    llm = FakeLLM(["```python\nprint(df['missing_col'])\n```", "It failed."])
    r = analyze(csv_file, "q", llm, tmp_path / "out")
    assert not r.execution.success
    assert "KeyError" in r.execution.stderr
    assert "FAILED" in llm.prompts[1]


def test_events_are_emitted_in_order(csv_file, tmp_path):
    seen = []
    llm = FakeLLM(["```python\nprint(1)\n```", "ok"])
    analyze(csv_file, "q", llm, tmp_path / "out", on_event=lambda k, d: seen.append(k))
    assert seen == [
        "profiling_started", "profile_ready", "coding_started", "code_generated",
        "execution_started", "execution_result", "answering_started", "answer_ready",
    ]
