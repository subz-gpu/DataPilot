# DataPilot

Agentic AI data analyst. Upload a dataset, give an objective, and a multi-agent
system plans, writes Python, runs it in a sandbox, fixes its own errors and
produces a report.

## Layout

| Folder | Purpose |
|---|---|
| `agents/` | Python agent service: sandbox, profiler, LLM client, agents |
| `gateway/` | Express + MongoDB API: auth, ownership, run history, SSE proxy |
| `web/` | React web app (Vite) |
| `mobile/` | Flutter client (later) |
| `scripts/` | Build and demo helpers |

## Setup

```powershell
# 1. Build the sandbox image (Docker Desktop must be running)
docker build -t datapilot-sandbox agents/sandbox

# 2. Python env (from the repo root)
cd agents
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt

# 3. Config: copy .env.example to .env in the repo root and add your Gemini key
cd ..
copy .env.example .env
```

## Run the tests (no API key or quota needed)

```powershell
cd agents
python -m pytest -v
```

## Run an analysis

```powershell
python ../scripts/make_sample_data.py

# Agentic mode (Step 3): plan -> code -> run -> critique -> retry -> report
python run.py ../data/sample/sales.csv "Which region has the highest total revenue? Revenue is units * unit_price * (1 - discount)." --show-code

# Single-pass mode (Step 2), for comparison
python run.py ../data/sample/sales.csv "Which region has the highest total revenue? Revenue is units * unit_price * (1 - discount)." --single
```

Useful flags: `--max-calls 30` (LLM call budget per run), `--attempts 3` (tries per step),
`--max-steps 5`, `--show-code`.

Each run saves `report.md`, `run.json` (every attempt, verdict and output) and
the charts under `runs/<timestamp>/`.

## How the agent loop works

1. **Profile** the dataset (in the sandbox, no LLM call).
2. **Plan**: the planner splits the objective into 1-5 steps.
3. For each step: **Coder** writes a script -> **Executor** runs it in the sandbox ->
   a crash goes straight back to the Coder with the traceback; a clean run goes to the
   **Critic**, who checks for silent data loss, inconsistent numbers and overclaiming and
   can send it back for a fix. Max 3 attempts per step.
4. **Reporter** writes the final report from verified results only. If the LLM is
   unavailable or the call budget runs out, a plain fallback report is produced.

## Run the API service (Step 4)

```powershell
cd agents
python -m pip install -r requirements.txt
python -m uvicorn api.main:app --port 8000
```

Open http://localhost:8000/docs for interactive docs where you can upload a file and start a run
from the browser. (Use `python -m uvicorn`, not bare `uvicorn`, on locked-down Windows machines.)

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Docker sandbox, LLM key and model status |
| `POST /api/datasets` | Upload a CSV / Excel / Parquet / JSON file (multipart `file`) |
| `GET /api/datasets/{id}/profile` | Column types, nulls, stats |
| `POST /api/runs` | Start an analysis: `{"dataset_id": "...", "objective": "..."}` |
| `GET /api/runs/{id}` | Status, plan, step results, final report |
| `GET /api/runs/{id}/events` | Live Server-Sent Events stream (supports `Last-Event-ID` to resume) |
| `GET /api/runs/{id}/files/{name}` | Download a chart or generated file |
| `GET /api/runs` | Recent runs |

Run status is `queued`, `running`, `succeeded`, `failed` (some step failed or the run stopped early)
or `error` (crash). Each SSE message is `{"seq": n, "type": "...", "ts": "...", "data": {...}}`.

Set `INTERNAL_API_KEY` in `.env` to require an `X-API-Key` header on every call (the Express
gateway will send it). Uploads and run options are capped server-side to protect the LLM quota.
Data lives in `data_store/` (ignored by git).

## Run the gateway (Step 5)

The gateway is the only thing the web and mobile apps talk to. It adds accounts and login,
keeps each user's datasets and run history in MongoDB, enforces per-user limits, and relays the
live event stream from the agent service.

```powershell
# 1. Add these lines to the .env in the repo root (see .env.example)
#      INTERNAL_API_KEY=<random>   (same file is read by BOTH services)
#      JWT_SECRET=<random, 32+ chars>
#      STORE=memory                (quick start)   or   MONGODB_URI=<your connection string>
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # prints a random value

# 2. Install and start (Node 20+)
cd gateway
npm install
npm start

# 3. In other terminals: Docker Desktop running, and the agent service
cd agents ; .venv\Scripts\Activate.ps1 ; python -m uvicorn api.main:app --port 8000

# 4. Try it end to end
cd gateway
node scripts/demo.js ..\data\sample\sales.csv "Which region has the highest total revenue?"
```

MongoDB: use a free MongoDB Atlas cluster (M0) and paste its connection string into `MONGODB_URI`,
or install MongoDB Community locally (`mongodb://127.0.0.1:27017/datapilot`).

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/register`, `/login` | Create an account / sign in. Returns `accessToken` (15 min) and `refreshToken` (30 days) |
| `POST /api/auth/refresh`, `/logout` | Swap a refresh token for a new pair (single use) / sign out |
| `GET /api/auth/me` | Current user |
| `POST /api/datasets` | Upload a file (multipart `file`) |
| `GET /api/datasets`, `/:id`, `/:id/profile`; `DELETE /:id` | Your datasets |
| `POST /api/runs` | `{"datasetId", "objective", "options"?}` starts an analysis |
| `GET /api/runs`, `/:id`; `DELETE /:id` | Run history and the final report |
| `GET /api/runs/:id/events` | Live Server-Sent Events (supports `Last-Event-ID`) |
| `GET /api/runs/:id/files/:name` | Charts and generated files |
| `GET /api/health` | Gateway, store and analysis-service status |

Send `Authorization: Bearer <accessToken>`. Browsers' `EventSource` and `<img>` cannot send headers,
so the events and files routes also accept `?access_token=`. Errors always look like
`{"error": {"code": "...", "message": "..."}}`.

Gateway tests (no Python or database needed): `cd gateway ; npm test`.
To also run the store tests against a real MongoDB: set `MONGODB_URI_TEST=mongodb://127.0.0.1:27017`.

## Run the web app (Step 6)

```powershell
cd web
npm install
npm run dev
```

Open http://localhost:5173. In development, Vite forwards `/api` to the gateway on port 4000, so there is
nothing to configure. You need all three running: Docker Desktop plus the agent service (port 8000),
the gateway (port 4000) and the web app (port 5173).

Pages: sign in or create an account; **Datasets** (upload, see column types and missing values);
**New analysis** (pick a dataset, ask a question); **Analyses** (history); and the **run page**, which shows
the agent's plan, every attempt with its code, output and the reviewer's verdict, then the report and charts.
Past runs replay the same log.

Tests: `npm test`. Production build: `npm run build` (output in `web/dist`). If the app is served from a
different address than the gateway, set `VITE_API_URL` (for example `https://api.example.com`) before building,
and add the app's address to `CORS_ORIGINS` in `.env`.

## Free-tier note

Gemini's free tier has small daily request limits, especially on the bigger
Flash models. The default model is a Flash-Lite one. Run
`python ../scripts/list_models.py` to see exact model IDs for your key, and set
`GEMINI_MODEL` in `.env`. Free-tier prompts may be used by Google to improve its
products, so don't upload sensitive or private datasets while on the free tier.
