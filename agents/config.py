"""Settings loaded from environment variables / the repo-level .env file."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
except ImportError:  # python-dotenv is optional; real env vars still work
    pass


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str
    gemini_model: str
    gemini_min_interval_s: float
    data_dir: Path = ROOT / "data_store"
    internal_api_key: str = ""  # if set, API calls must send it as X-API-Key
    max_upload_mb: int = 50
    max_concurrent_runs: int = 1
    cors_origins: tuple = ()


def get_settings() -> Settings:
    origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
    return Settings(
        gemini_api_key=os.environ.get("GEMINI_API_KEY", "").strip(),
        gemini_model=os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite").strip(),
        gemini_min_interval_s=float(os.environ.get("GEMINI_MIN_INTERVAL_S", "5")),
        data_dir=Path(os.environ.get("DATAPILOT_DATA_DIR", str(ROOT / "data_store"))),
        internal_api_key=os.environ.get("INTERNAL_API_KEY", "").strip(),
        max_upload_mb=int(os.environ.get("MAX_UPLOAD_MB", "50")),
        max_concurrent_runs=int(os.environ.get("MAX_CONCURRENT_RUNS", "1")),
        cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
    )
