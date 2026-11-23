"""Try the sandbox by hand:  python scripts/demo_sandbox.py data/sample/sales.csv"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "agents"))
from sandbox import run_code, sandbox_ready  # noqa: E402

if not sandbox_ready():
    sys.exit("Sandbox image not found. Run scripts/build_sandbox.sh first.")

dataset = sys.argv[1] if len(sys.argv) > 1 else None

CODE = """
import os, pandas as pd
df = pd.read_csv(os.environ['DATASET_PATH'])
print(df.shape)
print(df.dtypes)
print(df.isna().sum())
print(df.describe(include='all').T.head(10))
"""

result = run_code(CODE, dataset)
print(result.summary_for_llm())
print(f"\n[{result.duration_s}s, exit={result.exit_code}]")
