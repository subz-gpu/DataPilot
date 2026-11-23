"""API tests. Most need no Docker; the end-to-end ones do."""
import json
import time

import pytest
from fastapi.testclient import TestClient

from api.main import create_app
from config import Settings
from sandbox import sandbox_ready

docker_required = pytest.mark.skipif(
    not sandbox_ready(), reason="Docker or sandbox image missing"
)

PLAN = '{"steps": [{"title": "Mean age", "goal": "Compute the mean age"}]}'
CODE = (
    "```python\n"
    "import os, matplotlib.pyplot as plt\n"
    "print('mean age', df['age'].mean())\n"
    "df['age'].plot(kind='hist'); plt.savefig(os.path.join(OUTPUT_DIR, 'ages.png')); plt.close()\n"
    "```"
)
APPROVE = '{"verdict": "approve", "issues": [], "fix_instructions": "", "caveats_for_report": []}'


class FakeLLM:
    def __init__(self, replies=()):
        self.replies = list(replies)
        self.calls = 0

    def generate(self, system, prompt):
        self.calls += 1
        return self.replies.pop(0)


def strict_loads(text):
    """json.loads that rejects NaN/Infinity, like JavaScript's JSON.parse does."""
    def boom(token):
        raise ValueError(f"invalid JSON constant: {token}")
    return json.loads(text, parse_constant=boom)


def make_settings(tmp_path, **kw):
    base = dict(
        gemini_api_key="", gemini_model="test-model", gemini_min_interval_s=0,
        data_dir=tmp_path / "store", cors_origins=(),
    )
    base.update(kw)
    return Settings(**base)


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(make_settings(tmp_path)))


def upload(client, content=b"name,age\nAsha,30\nBen,25\nChitra,41\n", name="people.csv"):
    return client.post("/api/datasets", files={"file": (name, content, "text/csv")})


# ------------------------------------------------------------ no Docker needed
def test_health_reports_configuration(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["model"] == "test-model"
    assert body["llm_configured"] is False


def test_upload_and_get_dataset(client):
    r = upload(client)
    assert r.status_code == 201
    meta = r.json()
    assert meta["filename"] == "people.csv" and meta["size_bytes"] > 0
    assert client.get(f"/api/datasets/{meta['id']}").json()["id"] == meta["id"]


def test_upload_rejects_bad_extension_empty_and_oversized(tmp_path):
    c = TestClient(create_app(make_settings(tmp_path, max_upload_mb=1)))
    assert upload(c, name="evil.exe").status_code == 415
    assert upload(c, content=b"").status_code == 400
    assert upload(c, content=b"x" * (2 * 1024 * 1024)).status_code == 413


def test_unknown_and_malformed_ids_return_404(client):
    assert client.get("/api/datasets/aaaaaaaaaaaa").status_code == 404
    assert client.get("/api/datasets/not-an-id").status_code == 404
    assert client.get("/api/runs/aaaaaaaaaaaa").status_code == 404
    assert client.get("/api/runs/..%2F..%2Fetc/events").status_code == 404


def test_create_run_validations(client):
    assert client.post("/api/runs", json={"dataset_id": "aaaaaaaaaaaa", "objective": "find stuff"}).status_code == 404
    ds = upload(client).json()["id"]
    # dataset exists but no LLM key configured
    assert client.post("/api/runs", json={"dataset_id": ds, "objective": "find stuff"}).status_code == 503
    # server-side caps on quota-sensitive options
    r = client.post("/api/runs", json={"dataset_id": ds, "objective": "find stuff", "max_llm_calls": 9999})
    assert r.status_code == 422


def test_api_key_is_enforced_when_configured(tmp_path):
    c = TestClient(create_app(make_settings(tmp_path, internal_api_key="s3cret")))
    assert c.get("/api/runs").status_code == 401
    assert c.get("/api/runs", headers={"X-API-Key": "wrong"}).status_code == 401
    assert c.get("/api/runs", headers={"X-API-Key": "s3cret"}).status_code == 200
    assert c.get("/api/health").status_code == 200  # health stays open


def test_delete_dataset(client):
    ds = upload(client).json()["id"]
    assert client.delete(f"/api/datasets/{ds}").status_code == 204
    assert client.get(f"/api/datasets/{ds}").status_code == 404


# ----------------------------------------------------------------- end to end
def _wait_done(client, run_id, timeout=60):
    end = time.time() + timeout
    while time.time() < end:
        s = client.get(f"/api/runs/{run_id}").json()
        if s["status"] in ("succeeded", "failed", "error"):
            return s
        time.sleep(0.2)
    raise AssertionError("run did not finish")


@docker_required
def test_full_run_stream_report_and_files(tmp_path):
    llm = FakeLLM([PLAN, CODE, APPROVE, "## Summary\nMean age is 32."])
    c = TestClient(create_app(make_settings(tmp_path), llm=llm))
    ds = upload(c).json()["id"]

    r = c.post("/api/runs", json={"dataset_id": ds, "objective": "What is the mean age?"})
    assert r.status_code == 202
    run_id = r.json()["run_id"]

    # stream the events until the server closes the stream
    types = []
    with c.stream("GET", f"/api/runs/{run_id}/events") as resp:
        assert resp.headers["content-type"].startswith("text/event-stream")
        for line in resp.iter_lines():
            if line.startswith("data: "):
                types.append(strict_loads(line[6:])["type"])
    for expected in ("plan_created", "step_started", "code_generated", "critic_verdict",
                     "step_done", "report_ready", "run_finished"):
        assert expected in types
    assert types[-1] == "run_finished"

    final = _wait_done(c, run_id)
    assert final["status"] == "succeeded"
    assert "Mean age is 32" in final["report"]
    assert final["steps"][0]["status"] == "approved"
    assert "ages.png" in final["files"]

    img = c.get(f"/api/runs/{run_id}/files/ages.png")
    assert img.status_code == 200 and img.headers["content-type"] == "image/png"
    assert c.get(f"/api/runs/{run_id}/files/..%2Frun.json").status_code == 404

    # SSE resume: ask only for events after seq 2
    with c.stream("GET", f"/api/runs/{run_id}/events", headers={"Last-Event-ID": "2"}) as resp:
        seqs = [json.loads(l[6:])["seq"] for l in resp.iter_lines() if l.startswith("data: ")]
    assert seqs and seqs[0] == 3

    # listed, and the dataset profile endpoint works
    assert any(x["id"] == run_id for x in c.get("/api/runs").json())
    assert c.get(f"/api/datasets/{ds}/profile").json()["rows"] == 3


@docker_required
def test_llm_failure_marks_run_error_not_stuck(tmp_path):
    class Boom:
        calls = 0

        def generate(self, system, prompt):
            raise RuntimeError("model exploded")

    c = TestClient(create_app(make_settings(tmp_path), llm=Boom()))
    ds = upload(c).json()["id"]
    run_id = c.post("/api/runs", json={"dataset_id": ds, "objective": "anything"}).json()["run_id"]
    final = _wait_done(c, run_id)
    assert final["status"] == "error" and "model exploded" in final["error"]


@docker_required
def test_profile_endpoint_works_with_missing_values(tmp_path):
    c = TestClient(create_app(make_settings(tmp_path)))
    ds = upload(c, content=b"name,age\nAsha,30\nBen,\n,41\n").json()["id"]
    r = c.get(f"/api/datasets/{ds}/profile")
    assert r.status_code == 200
    assert "NaN" not in r.text
    strict_loads(r.text)
