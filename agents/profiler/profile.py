"""Dataset profiler: runs inside the sandbox and returns a compact JSON profile."""
from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path

from sandbox.loader import LOADER_CODE
from sandbox import run_code

MAX_FIELDS = 60

PROFILE_CODE = '''
import json

def _num(x):
    try:
        x = float(x)
        return None if x != x else round(x, 4)
    except Exception:
        return None

profile = {
    "rows": int(len(df)),
    "columns": int(df.shape[1]),
    "duplicate_rows": int(df.duplicated().sum()),
    "fields": [],
}
cols = list(df.columns)
if len(cols) > MAX_FIELDS:
    profile["columns_truncated"] = True
    cols = cols[:MAX_FIELDS]

for col in cols:
    s = df[col]
    nn = s.dropna()
    info = {
        "name": str(col),
        "dtype": str(s.dtype),
        "nulls": int(s.isna().sum()),
        "null_pct": round(float(s.isna().mean()) * 100, 2),
        "unique": int(s.nunique(dropna=True)),
        "samples": [str(v)[:60] for v in nn.head(3)],
    }
    if pd.api.types.is_bool_dtype(s):
        info["top_values"] = {str(k): int(v) for k, v in s.value_counts().head(5).items()}
    elif pd.api.types.is_numeric_dtype(s):
        if len(nn):
            info["stats"] = {
                "min": _num(nn.min()), "max": _num(nn.max()), "mean": _num(nn.mean()),
                "median": _num(nn.median()), "std": _num(nn.std()),
            }
    elif pd.api.types.is_datetime64_any_dtype(s):
        if len(nn):
            info["range"] = [str(nn.min()), str(nn.max())]
    else:
        sample = nn.astype(str).head(200)
        looks_date = len(sample) > 0 and sample.str.contains(r"[-/:]").mean() > 0.8
        if looks_date:
            parsed = pd.to_datetime(sample, errors="coerce")
            if parsed.notna().mean() > 0.9:
                info["likely_datetime"] = True
                info["range"] = [str(parsed.min()), str(parsed.max())]
        if "likely_datetime" not in info:
            info["top_values"] = {str(k)[:40]: int(v) for k, v in nn.astype(str).value_counts().head(5).items()}
    profile["fields"].append(info)

profile["head"] = [
    {str(k): (None if pd.isna(v) else str(v)[:60]) for k, v in row.items()}
    for row in df.head(5).to_dict("records")
]
with open(os.path.join(OUTPUT_DIR, "profile.json"), "w", encoding="utf-8") as f:
    json.dump(profile, f, default=str)
'''


class ProfilerError(RuntimeError):
    pass


def profile_dataset(dataset_path: str | Path, timeout_s: int = 60) -> dict:
    out = Path(tempfile.mkdtemp(prefix="datapilot-profile-"))
    try:
        code = LOADER_CODE + f"\nMAX_FIELDS = {MAX_FIELDS}\n" + PROFILE_CODE
        result = run_code(code, dataset_path, output_dir=out, timeout_s=timeout_s)
        pfile = out / "profile.json"
        if not result.success or not pfile.exists():
            raise ProfilerError(f"Could not profile dataset:\n{result.summary_for_llm()}")
        return json.loads(pfile.read_text(encoding="utf-8"))
    finally:
        shutil.rmtree(out, ignore_errors=True)


def format_profile_for_prompt(profile: dict) -> str:
    """Compact, LLM-friendly text version of the profile."""
    lines = [
        f"Rows: {profile['rows']}, Columns: {profile['columns']}, "
        f"Duplicate rows: {profile['duplicate_rows']}",
        "Columns:",
    ]
    for f in profile["fields"]:
        parts = [f"- {f['name']} ({f['dtype']}), nulls={f['null_pct']}%, unique={f['unique']}"]
        if "stats" in f:
            s = f["stats"]
            parts.append(f"min={s['min']}, max={s['max']}, mean={s['mean']}, median={s['median']}")
        if f.get("likely_datetime"):
            parts.append(f"looks like dates (stored as text), range {f['range'][0]} to {f['range'][1]}")
        elif "range" in f:
            parts.append(f"range {f['range'][0]} to {f['range'][1]}")
        if "top_values" in f:
            parts.append(f"top values: {f['top_values']}")
        if "stats" not in f and "top_values" not in f and "range" not in f and f["samples"]:
            parts.append(f"samples: {f['samples']}")
        lines.append("; ".join(parts))
    if profile.get("columns_truncated"):
        lines.append(f"(Only the first {MAX_FIELDS} columns are shown.)")
    lines.append(f"First rows: {profile['head']}")
    return "\n".join(lines)
