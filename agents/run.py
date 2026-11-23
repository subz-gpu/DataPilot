"""DataPilot CLI.

Agentic mode (default): plan -> code -> run -> critique -> retry -> report
    python run.py ../data/sample/sales.csv "Which region has the highest total revenue?"

Single-pass mode (Step 2): one code attempt, no critic
    python run.py ../data/sample/sales.csv "..." --single
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from agent import analyze, run_analysis
from config import get_settings
from llm import GeminiClient, LLMError

ROOT = Path(__file__).resolve().parent.parent


def _make_printer(show_code: bool):
    def show(kind: str, d: dict) -> None:
        if kind == "profile_ready":
            p = d["profile"]
            print(f"Profiled dataset: {p['rows']} rows x {p['columns']} columns")
        elif kind == "planning_started":
            print("Planning the analysis...")
        elif kind == "plan_created":
            print("\nPlan:")
            for i, s in enumerate(d["plan"], 1):
                print(f"  {i}. {s['title']}")
        elif kind == "step_started":
            print(f"\n=== Step {d['index']}/{d['total']}: {d['title']} ===")
        elif kind == "step_skipped":
            print(f"\n=== Step {d['index']} skipped ({d['reason']}) ===")
        elif kind == "attempt_started":
            print(f"  attempt {d['attempt']}: writing code...")
        elif kind == "code_generated" and show_code:
            print("  ----- code -----")
            print("\n".join("  " + line for line in d["code"].splitlines()))
            print("  ----------------")
        elif kind == "execution_result":
            ex = d["execution"]
            if ex["success"]:
                print(f"    ran OK in {ex['duration_s']}s")
            else:
                last = (ex["stderr"].strip().splitlines() or ["(no error text)"])[-1]
                print(f"    FAILED: {last[:160]}")
        elif kind == "critic_verdict":
            v = d["verdict"]
            if v["approve"]:
                extra = f" ({len(v['caveats'])} caveat(s) noted)" if v["caveats"] else ""
                print(f"    critic: approved{extra}")
            else:
                print("    critic: changes requested")
                for issue in v["issues"]:
                    print(f"      - {issue[:200]}")
        elif kind == "retry":
            print(f"    retrying ({d['reason']})")
        elif kind == "step_done":
            print(f"  -> step {d['index']} {d['status']}")
        elif kind == "reporting_started":
            print("\nWriting the final report...")

    return show


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    ap = argparse.ArgumentParser(description="DataPilot data analyst")
    ap.add_argument("dataset", help="Path to a CSV / Excel / Parquet / JSON file")
    ap.add_argument("question", help="What you want to find out")
    ap.add_argument("--single", action="store_true", help="Step 2 single-pass mode")
    ap.add_argument("--timeout", type=int, default=60, help="Sandbox timeout per run (s)")
    ap.add_argument("--max-steps", type=int, default=5)
    ap.add_argument("--attempts", type=int, default=3, help="Max attempts per step")
    ap.add_argument("--max-calls", type=int, default=30, help="Max LLM calls per run")
    ap.add_argument("--show-code", action="store_true", help="Print generated code")
    args = ap.parse_args()

    settings = get_settings()
    try:
        llm = GeminiClient(
            settings.gemini_api_key, settings.gemini_model, settings.gemini_min_interval_s
        )
    except LLMError as e:
        print(f"Error: {e}")
        return 1

    run_dir = ROOT / "runs" / datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = run_dir / "outputs"
    run_dir.mkdir(parents=True, exist_ok=True)
    print(f"Model: {settings.gemini_model}")

    try:
        if args.single:
            r = analyze(args.dataset, args.question, llm, out_dir, args.timeout,
                        lambda k, d: _make_printer(True)(k, d))
            report, ok, calls, files = r.answer, r.execution.success, r.llm_calls, r.execution.files
            payload = {"mode": "single", "code": r.code, "execution": r.execution.to_dict()}
        else:
            r = run_analysis(
                args.dataset, args.question, llm, out_dir,
                max_steps=args.max_steps, max_attempts=args.attempts,
                max_llm_calls=args.max_calls, timeout_s=args.timeout,
                on_event=_make_printer(args.show_code),
            )
            report, ok, calls, files = r.report, r.ok, r.llm_calls, r.files
            payload = {"mode": "agentic", **r.to_dict()}
            if r.stop_reason:
                print(f"\nNote: run stopped early - {r.stop_reason}")
    except (LLMError, FileNotFoundError) as e:
        print(f"Error: {e}")
        return 1

    print("\n=========== REPORT ===========\n")
    print(report)
    print("\n==============================")
    print(f"LLM calls used: {calls} | outputs: {out_dir}")
    if files:
        print("Files:", ", ".join(files))

    (run_dir / "report.md").write_text(report, encoding="utf-8")
    payload.update({"model": settings.gemini_model, "question": args.question})
    (run_dir / "run.json").write_text(
        json.dumps(payload, indent=2, default=str), encoding="utf-8"
    )
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
