"""DataPilot agent service (FastAPI).

    python -m uvicorn api.main:app --port 8000

Interactive docs: http://localhost:8000/docs
"""
from __future__ import annotations

import asyncio
import hmac
import json
import shutil
import threading
import time
from pathlib import Path

from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from config import Settings, get_settings
from llm import GeminiClient
from profiler import ProfilerError, profile_dataset
from sandbox import sandbox_ready

from .store import ALLOWED_EXT, DatasetStore, RunManager, json_safe, now_iso, valid_id
from .dataset_discovery import (
    search_huggingface_datasets,
    get_huggingface_dataset_details,
    search_kaggle_datasets,
    get_kaggle_dataset_details,
)
from .dataset_evaluator import rank_datasets
from .dataset_importer import (
    import_huggingface_csv,
    import_kaggle_dataset,
)

class RunRequest(BaseModel):
    dataset_id: str
    objective: str = Field(min_length=3, max_length=2000)
    # Server-side caps protect the (free-tier) LLM quota.
    max_steps: int = Field(5, ge=1, le=8)
    max_attempts: int = Field(3, ge=1, le=5)
    max_llm_calls: int = Field(30, ge=3, le=60)

class DatasetSearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=200)
    limit: int = Field(default=10, ge=1, le=50)
    source: str = Field(default="huggingface", pattern="^(huggingface|kaggle)$")


class DatasetImportRequest(BaseModel):
    dataset_id: str = Field(min_length=1, max_length=200)
    filename: str = Field(min_length=1, max_length=255)
    source: str = Field(default="huggingface", pattern="^(huggingface|kaggle)$")

def create_app(settings: Settings | None = None, llm=None) -> FastAPI:
    settings = settings or get_settings()
    root = Path(settings.data_dir)
    datasets = DatasetStore(root)

    state = {"llm": llm}
    llm_lock = threading.Lock()

    def get_llm():
        with llm_lock:
            if state["llm"] is None:
                state["llm"] = GeminiClient(
                    settings.gemini_api_key,
                    settings.gemini_model,
                    settings.gemini_min_interval_s,
                )
            return state["llm"]

    llm_configured = llm is not None or bool(settings.gemini_api_key)
    runs = RunManager(root, datasets, get_llm, settings.max_concurrent_runs)

    def auth(x_api_key: str | None = Header(default=None)) -> None:
        if settings.internal_api_key and not hmac.compare_digest(
            x_api_key or "", settings.internal_api_key
        ):
            raise HTTPException(401, "Missing or invalid X-API-Key.")

    app = FastAPI(title="DataPilot Agent Service", version="0.4.0")
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # ------------------------------------------------------------- health
    @app.get("/api/health")
    async def health():
        ready = await run_in_threadpool(sandbox_ready)
        return {
            "status": "ok",
            "sandbox_ready": ready,
            "llm_configured": llm_configured,
            "model": settings.gemini_model,
            "time": now_iso(),
        }
    @app.get(
        "/api/datasets/discover/{dataset_id:path}",
        dependencies=[Depends(auth)],
    )
    async def discovered_dataset_details(
        dataset_id: str,
        source: str = "huggingface",
    ):
        try:
            if source == "kaggle":
                details = await run_in_threadpool(
                    get_kaggle_dataset_details,
                    dataset_id,
                )
            elif source == "huggingface":
                details = await run_in_threadpool(
                    get_huggingface_dataset_details,
                    dataset_id,
                )
            else:
                raise HTTPException(400, "Unsupported dataset source.")

            return details

        except ValueError as exc:
            raise HTTPException(400, str(exc))
        except RuntimeError as exc:
            raise HTTPException(502, str(exc))
            
   
    @app.post(
        "/api/datasets/import",
        status_code=201,
        dependencies=[Depends(auth)],
    )
    async def import_dataset(req: DatasetImportRequest):
        try:
            if req.source == "kaggle":
                details_function = get_kaggle_dataset_details
                importer_function = import_kaggle_dataset
                provider_name = "Kaggle"
            else:
                details_function = get_huggingface_dataset_details
                importer_function = import_huggingface_csv
                provider_name = "Hugging Face"

            details = await run_in_threadpool(
                details_function,
                req.dataset_id,
            )

            files = details.get("files", [])

            if req.filename not in files:
                raise HTTPException(
                    400,
                    f"Requested file does not exist in this {provider_name} dataset.",
                )

            license_value = details.get("license", "Not specified")

            if isinstance(license_value, list):
                license_value = ", ".join(str(x) for x in license_value)

            result = await run_in_threadpool(
                importer_function,
                datasets,
                req.dataset_id,
                req.filename,
                license_value,
            )

            return result

        except ValueError as exc:
            raise HTTPException(400, str(exc))
        except RuntimeError as exc:
            raise HTTPException(502, str(exc))

    # ----------------------------------------------------------- datasets
    @app.post("/api/datasets/discover", dependencies=[Depends(auth)])
    async def discover_datasets(req: DatasetSearchRequest):
        try:
            if req.source == "kaggle":
                search_function = search_kaggle_datasets
                details_function = get_kaggle_dataset_details
            else:
                search_function = search_huggingface_datasets
                details_function = get_huggingface_dataset_details

            results = await run_in_threadpool(
                search_function,
                req.query,
                req.limit,
            )

            detailed = []

            for result in results:
                try:
                    details = await run_in_threadpool(
                        details_function,
                        result["id"],
                    )

                    # Preserve popularity and other search metadata.
                    details.update(result)

                    detailed.append(details)

                except RuntimeError:
                    continue

            ranked = rank_datasets(detailed, req.query)

            return {
                "query": req.query,
                "source": req.source,
                "total": len(ranked),
                "datasets": ranked,
            }

        except ValueError as exc:
            raise HTTPException(400, str(exc))
        except RuntimeError as exc:
            raise HTTPException(502, str(exc))
    @app.post("/api/datasets", status_code=201, dependencies=[Depends(auth)])
    async def upload_dataset(file: UploadFile = File(...)):
        ext = Path(file.filename or "").suffix.lower()
        if ext not in ALLOWED_EXT:
            raise HTTPException(415, f"Unsupported file type. Allowed: {sorted(ALLOWED_EXT)}")
        did, path = datasets.create(file.filename)
        limit = settings.max_upload_mb * 1024 * 1024
        size = 0
        try:
            with open(path, "wb") as f:
                while chunk := await file.read(1024 * 1024):
                    size += len(chunk)
                    if size > limit:
                        raise HTTPException(413, f"File exceeds {settings.max_upload_mb} MB.")
                    f.write(chunk)
            if size == 0:
                raise HTTPException(400, "The uploaded file is empty.")
        except HTTPException:
            shutil.rmtree(datasets.dir(did), ignore_errors=True)
            raise
        meta = {
            "id": did,
            "filename": file.filename,
            "stored_name": path.name,
            "size_bytes": size,
            "uploaded_at": now_iso(),
        }
        datasets.save_meta(did, meta)
        return meta

    @app.get("/api/datasets/{dataset_id}", dependencies=[Depends(auth)])
    async def get_dataset(dataset_id: str):
        meta = datasets.meta(dataset_id)
        if not meta:
            raise HTTPException(404, "Dataset not found.")
        return meta

    @app.get("/api/datasets/{dataset_id}/profile", dependencies=[Depends(auth)])
    async def dataset_profile(dataset_id: str):
        path = datasets.path(dataset_id)
        if path is None:
            raise HTTPException(404, "Dataset not found.")
        cached = datasets.cached_profile(dataset_id)
        if cached:
            return json_safe(cached)
        try:
            profile = await run_in_threadpool(profile_dataset, path)
        except ProfilerError as e:
            raise HTTPException(422, str(e))
        profile = json_safe(profile)
        datasets.save_profile(dataset_id, profile)
        return profile

    @app.delete("/api/datasets/{dataset_id}", status_code=204, dependencies=[Depends(auth)])
    async def delete_dataset(dataset_id: str):
        if not datasets.delete(dataset_id):
            raise HTTPException(404, "Dataset not found.")

    # --------------------------------------------------------------- runs
    @app.post("/api/runs", status_code=202, dependencies=[Depends(auth)])
    async def create_run(req: RunRequest):
        if datasets.path(req.dataset_id) is None:
            raise HTTPException(404, "Dataset not found.")
        if not llm_configured:
            raise HTTPException(503, "LLM is not configured. Set GEMINI_API_KEY.")
        rec = runs.create(
            req.dataset_id,
            req.objective.strip(),
            {
                "max_steps": req.max_steps,
                "max_attempts": req.max_attempts,
                "max_llm_calls": req.max_llm_calls,
            },
        )
        return {"run_id": rec.id, "status": rec.status}

    @app.get("/api/runs", dependencies=[Depends(auth)])
    async def list_runs(limit: int = 50):
        return await run_in_threadpool(runs.list, max(1, min(limit, 200)))

    @app.get("/api/runs/{run_id}", dependencies=[Depends(auth)])
    async def get_run(run_id: str):
        rec = runs.get(run_id)
        if rec is None:
            raise HTTPException(404, "Run not found.")
        return rec.summary()

    @app.get("/api/runs/{run_id}/events", dependencies=[Depends(auth)])
    async def stream_events(
        run_id: str, request: Request, last_event_id: str | None = Header(default=None)
    ):
        rec = runs.get(run_id)
        if rec is None:
            raise HTTPException(404, "Run not found.")
        try:
            start = int(last_event_id) + 1 if last_event_id is not None else 0
        except ValueError:
            start = 0

        async def gen():
            idx = start
            last_beat = time.monotonic()
            while True:
                if await request.is_disconnected():
                    break
                terminal = rec.is_terminal  # read BEFORE the events, so none are missed
                batch = rec.events_since(idx)
                for ev in batch:
                    yield f"id: {ev['seq']}\ndata: {json.dumps(json_safe(ev), default=str, allow_nan=False)}\n\n"
                    idx = ev["seq"] + 1
                if batch:
                    last_beat = time.monotonic()
                elif terminal:
                    break
                else:
                    if time.monotonic() - last_beat > 15:
                        yield ": keep-alive\n\n"
                        last_beat = time.monotonic()
                    await asyncio.sleep(0.25)

        return StreamingResponse(
            gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.get("/api/runs/{run_id}/files/{name:path}", dependencies=[Depends(auth)])
    async def get_run_file(run_id: str, name: str):
        if not valid_id(run_id) or runs.get(run_id) is None:
            raise HTTPException(404, "Run not found.")
        base = runs.outputs_dir(run_id).resolve()
        target = (base / name).resolve()
        if not target.is_relative_to(base) or not target.is_file():
            raise HTTPException(404, "File not found.")
        return FileResponse(target)

    return app


app = create_app()
