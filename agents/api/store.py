"""File-backed storage for datasets and runs, plus the background run manager."""
from __future__ import annotations

import json
import math
import re
import shutil
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from agent import run_analysis

ID_RE = re.compile(r"^[a-f0-9]{12}$")
ALLOWED_EXT = {".csv", ".txt", ".xlsx", ".xls", ".parquet", ".json"}
TERMINAL = {"succeeded", "failed", "error"}


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def valid_id(value: str | None) -> bool:
    return bool(ID_RE.match(value or ""))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def json_safe(obj):
    """Replace NaN / Infinity (invalid in strict JSON, so JS and Dart parsers reject them) with None."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_safe(v) for v in obj]
    return obj


def safe_filename(name: str | None) -> str:
    base = Path(name or "dataset").name
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._") or "dataset"
    return base[:100]


# ------------------------------------------------------------------ datasets
class DatasetStore:
    def __init__(self, root: Path):
        self.root = Path(root) / "datasets"
        self.root.mkdir(parents=True, exist_ok=True)

    def dir(self, dataset_id: str) -> Path:
        return self.root / dataset_id

    def create(self, original_name: str | None) -> tuple[str, Path]:
        did = new_id()
        d = self.dir(did)
        d.mkdir(parents=True)
        return did, d / safe_filename(original_name)

    def save_meta(self, dataset_id: str, meta: dict) -> None:
        (self.dir(dataset_id) / "meta.json").write_text(json.dumps(meta), encoding="utf-8")

    def meta(self, dataset_id: str) -> dict | None:
        if not valid_id(dataset_id):
            return None
        f = self.dir(dataset_id) / "meta.json"
        return json.loads(f.read_text(encoding="utf-8")) if f.is_file() else None

    def path(self, dataset_id: str) -> Path | None:
        meta = self.meta(dataset_id)
        if not meta:
            return None
        p = self.dir(dataset_id) / meta["stored_name"]
        return p if p.is_file() else None

    def cached_profile(self, dataset_id: str) -> dict | None:
        f = self.dir(dataset_id) / "profile.json"
        return json.loads(f.read_text(encoding="utf-8")) if f.is_file() else None

    def save_profile(self, dataset_id: str, profile: dict) -> None:
        (self.dir(dataset_id) / "profile.json").write_text(json.dumps(profile), encoding="utf-8")

    def delete(self, dataset_id: str) -> bool:
        if not self.meta(dataset_id):
            return False
        shutil.rmtree(self.dir(dataset_id), ignore_errors=True)
        return True


# ---------------------------------------------------------------------- runs
class RunRecord:
    def __init__(self, run_id: str, dataset_id: str, objective: str, options: dict):
        self.id = run_id
        self.dataset_id = dataset_id
        self.objective = objective
        self.options = options
        self.status = "queued"
        self.created_at = now_iso()
        self.started_at: str | None = None
        self.finished_at: str | None = None
        self.error: str | None = None
        self.llm_calls = 0
        self.stop_reason: str | None = None
        self.plan: list[dict] = []
        self.steps: list[dict] = []
        self.report: str | None = None
        self.files: list[str] = []
        self.events: list[dict] = []
        self._lock = threading.Lock()

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL

    def add_event(self, kind: str, data: dict) -> dict:
        with self._lock:
            ev = {"seq": len(self.events), "type": kind, "ts": now_iso(), "data": json_safe(data)}
            self.events.append(ev)
            return ev

    def events_since(self, idx: int) -> list[dict]:
        with self._lock:
            return self.events[idx:]

    def summary(self) -> dict:
        return {
            "id": self.id,
            "dataset_id": self.dataset_id,
            "objective": self.objective,
            "options": self.options,
            "status": self.status,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "error": self.error,
            "llm_calls": self.llm_calls,
            "stop_reason": self.stop_reason,
            "plan": self.plan,
            "steps": self.steps,
            "report": self.report,
            "files": self.files,
        }


class RunManager:
    def __init__(
        self,
        root: Path,
        datasets: DatasetStore,
        llm_provider: Callable[[], object],
        max_workers: int = 1,
    ):
        self.root = Path(root) / "runs"
        self.root.mkdir(parents=True, exist_ok=True)
        self.datasets = datasets
        self.llm_provider = llm_provider
        self.runs: dict[str, RunRecord] = {}
        self.pool = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="datapilot-run")

    def run_dir(self, run_id: str) -> Path:
        return self.root / run_id

    def outputs_dir(self, run_id: str) -> Path:
        return self.run_dir(run_id) / "outputs"

    # -- lifecycle
    def create(self, dataset_id: str, objective: str, options: dict) -> RunRecord:
        rec = RunRecord(new_id(), dataset_id, objective, options)
        self.run_dir(rec.id).mkdir(parents=True)
        self.runs[rec.id] = rec
        self._save(rec)
        self.pool.submit(self._execute, rec)
        return rec

    def get(self, run_id: str) -> RunRecord | None:
        if not valid_id(run_id):
            return None
        rec = self.runs.get(run_id)
        if rec is None:
            rec = self._load(run_id)
            if rec is not None:
                self.runs[run_id] = rec
        return rec

    def list(self, limit: int = 50) -> list[dict]:
        dirs = [d for d in self.root.iterdir() if d.is_dir() and valid_id(d.name)]
        dirs.sort(key=lambda d: d.stat().st_mtime, reverse=True)
        out = []
        for d in dirs[:limit]:
            rec = self.get(d.name)
            if rec:
                s = rec.summary()
                s.pop("report", None)  # keep the list light
                out.append(s)
        return out

    # -- internals
    def _save(self, rec: RunRecord) -> None:
        (self.run_dir(rec.id) / "state.json").write_text(
            json.dumps(rec.summary(), default=str), encoding="utf-8"
        )

    def _load(self, run_id: str) -> RunRecord | None:
        state = self.run_dir(run_id) / "state.json"
        if not state.is_file():
            return None
        s = json.loads(state.read_text(encoding="utf-8"))
        rec = RunRecord(s["id"], s["dataset_id"], s["objective"], s.get("options", {}))
        for k in ("status", "created_at", "started_at", "finished_at", "error",
                  "llm_calls", "stop_reason", "plan", "steps", "report", "files"):
            setattr(rec, k, s.get(k, getattr(rec, k)))
        ev_file = self.run_dir(run_id) / "events.jsonl"
        if ev_file.is_file():
            for line in ev_file.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    rec.events.append(json.loads(line))
        if rec.status in ("queued", "running"):
            rec.status = "error"
            rec.error = "The server restarted while this run was in progress."
            self._save(rec)
        return rec

    def _emit(self, rec: RunRecord, kind: str, data: dict) -> None:
        ev = rec.add_event(kind, data)
        with open(self.run_dir(rec.id) / "events.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(ev, default=str) + "\n")
        if kind == "plan_created":
            rec.plan = data.get("plan", [])
        elif kind == "step_done":
            rec.steps.append(
                {
                    "index": data.get("index"),
                    "title": data.get("title"),
                    "status": data.get("status"),
                    "caveats": data.get("caveats", []),
                }
            )
        if kind in ("plan_created", "step_done"):
            self._save(rec)

    def _execute(self, rec: RunRecord) -> None:
        rec.status = "running"
        rec.started_at = now_iso()
        self._save(rec)
        rd = self.run_dir(rec.id)
        try:
            ds_path = self.datasets.path(rec.dataset_id)
            if ds_path is None:
                raise FileNotFoundError("Dataset file is missing.")
            llm = self.llm_provider()
            o = rec.options
            result = run_analysis(
                ds_path,
                rec.objective,
                llm,
                self.outputs_dir(rec.id),
                max_steps=o.get("max_steps", 5),
                max_attempts=o.get("max_attempts", 3),
                max_llm_calls=o.get("max_llm_calls", 30),
                on_event=lambda kind, data: self._emit(rec, kind, data),
            )
            (rd / "run.json").write_text(
                json.dumps(result.to_dict(), indent=2, default=str), encoding="utf-8"
            )
            (rd / "report.md").write_text(result.report, encoding="utf-8")
            rec.report = result.report
            rec.files = result.files
            rec.llm_calls = result.llm_calls
            rec.stop_reason = result.stop_reason
            rec.status = "succeeded" if result.ok else "failed"
        except Exception as e:  # never let a crash leave a run stuck in "running"
            rec.error = f"{type(e).__name__}: {e}"
            self._emit(rec, "run_error", {"error": rec.error})
            rec.status = "error"
        finally:
            rec.finished_at = now_iso()
            self._save(rec)
