"""Pure-logic tests: no Docker, no API."""
from agent.critic import review
from agent.jsonutil import clean_paths, extract_json
from agent.planner import make_plan
from agent.reporter import fallback_report
from agent.state import StepRecord


class FakeLLM:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = 0

    def generate(self, system, prompt):
        self.calls += 1
        return self.replies.pop(0)


def test_extract_json_plain_fenced_and_wrapped():
    assert extract_json('{"a": 1}') == {"a": 1}
    assert extract_json('```json\n{"a": 2}\n```') == {"a": 2}
    assert extract_json('Sure! Here it is: {"a": 3} hope that helps') == {"a": 3}
    assert extract_json("not json at all") is None


def test_plan_parsed_and_capped():
    reply = '{"steps": [{"title": "A", "goal": "do a"}, {"title": "B", "goal": "do b"}, {"title": "C", "goal": "do c"}]}'
    plan = make_plan(FakeLLM([reply]), "profile", "objective", max_steps=2)
    assert [s["title"] for s in plan] == ["A", "B"]


def test_plan_falls_back_to_single_step_on_garbage():
    plan = make_plan(FakeLLM(["sorry, no"]), "profile", "find the thing", max_steps=4)
    assert len(plan) == 1 and plan[0]["goal"] == "find the thing"


def test_critic_revise_and_approve_parsing():
    revise = '{"verdict": "revise", "issues": ["dropped rows"], "fix_instructions": "keep them", "caveats_for_report": []}'
    v = review(FakeLLM([revise]), "o", "g", "p", "code", "out")
    assert not v.approve and v.issues == ["dropped rows"] and v.fix_instructions == "keep them"
    ok = review(FakeLLM(['{"verdict": "approve", "issues": [], "caveats_for_report": ["close call"]}']), "o", "g", "p", "c", "e")
    assert ok.approve and ok.caveats == ["close call"]


def test_critic_unparseable_reply_is_approved_with_caveat():
    v = review(FakeLLM(["¯\\_(ツ)_/¯"]), "o", "g", "p", "c", "e")
    assert v.approve and not v.parsed and v.caveats


def test_fallback_report_contains_outputs_and_stop_reason():
    rec = StepRecord(index=1, title="T", goal="g", status="approved", output="North: 5")
    text = fallback_report("obj", [rec], ["chart.png"], "LLM call budget reached")
    assert "North: 5" in text and "chart.png" in text and "budget" in text


def test_clean_paths_hides_sandbox_directories():
    text = "Saved to /work/outputs/cleaned.parquet and read /data/dataset.csv"
    cleaned = clean_paths(text)
    assert "/work/outputs/" not in cleaned and "cleaned.parquet" in cleaned
    assert clean_paths("") == ""


def test_json_safe_replaces_nan_and_inf():
    import json

    from api.store import json_safe

    data = {"a": float("nan"), "b": [1.0, float("inf")], "c": {"d": float("-inf"), "e": "ok"}}
    clean = json_safe(data)
    assert clean == {"a": None, "b": [1.0, None], "c": {"d": None, "e": "ok"}}
    json.dumps(clean, allow_nan=False)  # must not raise
