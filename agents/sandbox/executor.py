"""Sandboxed Python executor for DataPilot.

LLM-generated code is NEVER run in the host process. Each run happens in a
fresh, locked-down Docker container:

  * no network
  * memory / CPU / process limits
  * read-only root filesystem and read-only dataset mount
  * non-root user, all Linux capabilities dropped
  * hard wall-clock timeout (container is killed)

Contract for the code that runs inside the container:
  * the dataset is at the path in env var DATASET_PATH
  * anything it wants to keep (charts, cleaned CSVs) goes in OUTPUT_DIR
"""
from __future__ import annotations
from .loader import LOADER_CODE
import os
import subprocess
import tempfile
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path

DEFAULT_IMAGE = "datapilot-sandbox"
MAX_STDOUT_CHARS = 8000
MAX_STDERR_CHARS = 4000


@dataclass
class ExecutionResult:
    success: bool
    stdout: str = ""
    stderr: str = ""
    exit_code: int | None = None
    timed_out: bool = False
    out_of_memory: bool = False  # heuristic: exit code 137 without a timeout
    duration_s: float = 0.0
    output_dir: str = ""
    files: list[str] = field(default_factory=list)  # relative to output_dir

    def to_dict(self) -> dict:
        return asdict(self)

    def summary_for_llm(self) -> str:
        """Compact text the Critic/Coder agents can read."""
        parts = [f"status: {'success' if self.success else 'FAILED'}"]
        if self.timed_out:
            parts.append("reason: timed out")
        if self.out_of_memory:
            parts.append("reason: likely out of memory")
        if self.stdout:
            parts.append(f"stdout:\n{self.stdout}")
        if self.stderr:
            parts.append(f"stderr:\n{self.stderr}")
        if self.files:
            parts.append("files created: " + ", ".join(self.files))
        return "\n".join(parts)


def _head(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n... [truncated {len(text) - limit} chars]"


def _tail(text: str, limit: int) -> str:
    """Keep the END of the text, because tracebacks end with the real error."""
    if len(text) <= limit:
        return text
    return f"[truncated {len(text) - limit} chars] ...\n" + text[-limit:]


def sandbox_ready(image: str | None = None) -> bool:
    """True if Docker is reachable and the sandbox image has been built."""
    image = image or os.environ.get("SANDBOX_IMAGE", DEFAULT_IMAGE)
    try:
        r = subprocess.run(
            ["docker", "image", "inspect", image],
            capture_output=True,
            timeout=15,
        )
        return r.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def run_code(
    code: str,
    dataset_path: str | os.PathLike | None = None,
    *,
    output_dir: str | os.PathLike | None = None,
    timeout_s: int = 30,
    memory: str = "512m",
    cpus: str = "1.0",
    image: str | None = None,
) -> ExecutionResult:
    """Run `code` in a sandbox container and return what happened.

    If output_dir is None a temp directory is created and left in place so the
    caller can read generated files; the caller owns cleanup.
    """
    image = image or os.environ.get("SANDBOX_IMAGE", DEFAULT_IMAGE)

    out_dir = Path(output_dir) if output_dir else Path(tempfile.mkdtemp(prefix="datapilot-out-"))
    out_dir.mkdir(parents=True, exist_ok=True)
    out_dir.chmod(0o777)  # container user is non-root

    name = f"dp-sbx-{uuid.uuid4().hex[:12]}"
    cmd = [
        "docker", "run", "--rm", "-i", "--name", name,
        "--network", "none",
        "--memory", memory, "--memory-swap", memory,
        "--cpus", cpus,
        "--pids-limit", "128",
        "--read-only",
        "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "--user", "1000:1000",
        "-e", "MPLBACKEND=Agg",
        "-e", "MPLCONFIGDIR=/tmp/mpl",
        "-e", "PYTHONDONTWRITEBYTECODE=1",
        "-e", "OUTPUT_DIR=/work/outputs",
        "-v", f"{out_dir.resolve()}:/work/outputs",
    ]

    if dataset_path:
        ds = Path(dataset_path).resolve()
        if not ds.is_file():
            raise FileNotFoundError(f"Dataset not found: {ds}")
        container_ds = f"/data/dataset{ds.suffix}"
        cmd += ["-v", f"{ds}:{container_ds}:ro", "-e", f"DATASET_PATH={container_ds}"]

    cmd += [image, "python", "-"]  # code arrives on stdin

    start = time.monotonic()
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    timed_out = False
    try:
        sandbox_code = (
            LOADER_CODE + "\n\n" + code
            if dataset_path
            else code
        )

        stdout, stderr = proc.communicate(
            input=sandbox_code,
            timeout=timeout_s,
        )
    except subprocess.TimeoutExpired:
        timed_out = True
        subprocess.run(["docker", "kill", name], capture_output=True)
        stdout, stderr = proc.communicate()
        stderr = (stderr or "") + f"\nExecution timed out after {timeout_s}s"

    exit_code = proc.returncode
    files = sorted(
        str(p.relative_to(out_dir)) for p in out_dir.rglob("*") if p.is_file()
    )

    return ExecutionResult(
        success=(exit_code == 0 and not timed_out),
        stdout=_head(stdout or "", MAX_STDOUT_CHARS),
        stderr=_tail(stderr or "", MAX_STDERR_CHARS),
        exit_code=exit_code,
        timed_out=timed_out,
        out_of_memory=(exit_code == 137 and not timed_out),
        duration_s=round(time.monotonic() - start, 2),
        output_dir=str(out_dir),
        files=files,
    )
