from __future__ import annotations

import json
import re


def extract_json(text: str):
    """Best-effort JSON extraction from an LLM reply. Returns None if impossible."""
    t = (text or "").strip()
    m = re.search(r"```(?:json)?\s*\n(.*?)```", t, re.DOTALL | re.IGNORECASE)
    if m:
        t = m.group(1).strip()
    try:
        return json.loads(t)
    except Exception:
        pass
    start, end = t.find("{"), t.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(t[start : end + 1])
        except Exception:
            return None
    return None


def clean_paths(text: str) -> str:
    """Hide sandbox-internal paths so reports mention file names only."""
    return (text or "").replace("/work/outputs/", "").replace("/data/", "")
