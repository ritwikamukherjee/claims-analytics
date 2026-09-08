# Claims Aging, Tracking & Action Item Automation

A standalone Databricks App (React + FastAPI) for payer claims operations.
Four tabs:

1. **Claims Aging** — open backlog, adjudication turnaround distribution,
   open-claim aging buckets, open dollar exposure, backlog by state, and an AI Summary.
2. **Denial Trends & Auto-Adjudication** — denial/zero-pay/edit-fire rates, auto-
   adjudication (PASS/FAIL/OVERRIDE) mix, top denial reasons, denial rate by
   state/LOB, and an AI Summary. Bridges to rework (denials + manual edits drive it).
3. **Rework & Root-Cause** — rework financial impact, root-cause
   drivers, provider concentration, ticket status, AI root-cause accuracy, AI Summary.
4. **Config-Change Monitoring** — post-deployment monitoring of config
   changes, anomaly detection, baseline-vs-monitoring daily denial-rate trends, AI Findings.

Data source: Unity Catalog Gold tables, queried through a Databricks SQL
warehouse. AI summaries call a Foundation Model serving endpoint.

## Architecture

```
claims-analytics/
├── app.py                 # FastAPI: JSON API + serves built React SPA
├── app.yaml               # Databricks App run config + resource env
├── requirements.txt       # Python deps
├── server/
│   ├── config.py          # Dual-mode auth (local profile vs App SP / OBO user)
│   ├── warehouse.py       # SQL warehouse statement execution + TTL cache
│   ├── data.py            # One query function per endpoint
│   ├── llm.py             # Foundation Model client (single LLM call)
│   └── insights.py        # v1 "agent": aggregates -> prompt -> LLM
└── frontend/              # Vite + React + recharts
    ├── src/               # App.jsx, AgingTab, DenialsTab, ReworkTab, MonitoringTab, components
    └── dist/              # Built SPA (served by FastAPI; keep for deploy)
```

## API endpoints

| Endpoint | Description |
|---|---|
| `GET /api/aging/kpis` | KPI cards for tab 1 (Claims Aging) |
| `GET /api/aging/charts` | backlog by status, turnaround dist, open aging, backlog by state |
| `GET /api/denials/kpis` | KPI cards for tab 2 (Denials & Auto-Adjudication) |
| `GET /api/denials/charts` | denial trend, top reasons, auto-adj mix, by state/LOB |
| `GET /api/rework/kpis` | KPI cards for tab 3 |
| `GET /api/rework/trends` | impact by root_cause + monthly trend |
| `GET /api/rework/providers` | top 10 providers by impact |
| `GET /api/rework/tickets` | status/priority breakdown + top tickets |
| `GET /api/monitoring/kpis` | KPI cards for tab 4 |
| `GET /api/monitoring/scorecard` | change scorecard with flags |
| `GET /api/monitoring/daily?change_id=` | daily baseline vs monitoring metrics |
| `GET /api/monitoring/anomalies?change_id=` | anomalies for a change |
| `GET /api/insights/aging` | AI summary (markdown) for tab 1 |
| `GET /api/insights/denials` | AI summary (markdown) for tab 2 |
| `GET /api/insights/rework` | AI summary (markdown) for tab 3 |
| `GET /api/insights/monitoring?change_id=` | AI findings (markdown) for tab 4 |

### Source tables

Set `UC_CATALOG` / `UC_SCHEMA` to a schema that contains:

- Tab 1: `claims_audit_consolidated`
- Tab 2: `postprod_claims` (trends) + `claims_audit_consolidated` (reasons, edit_status)
- Tab 3: `rework_*` gold tables
- Tab 4: `monitoring_*` + `config_changes`

## Run locally

Requires: Python 3.11+ with `fastapi`, `uvicorn`, `databricks-sdk`, `requests`;
Node 18+; a Databricks CLI profile.

```bash
# 1. Build the frontend (outputs to frontend/dist)
cd frontend && npm install && npm run build && cd ..

# 2. Start the backend (serves API + built SPA on :8000)
DATABRICKS_PROFILE=<your-profile> \
  DATABRICKS_WAREHOUSE_ID=<your-warehouse-id> \
  UC_CATALOG=<your-catalog> UC_SCHEMA=<your-schema> \
  python3 -m uvicorn app:app --host 127.0.0.1 --port 8000

# open http://127.0.0.1:8000
```

### Frontend dev mode (hot reload)

```bash
# terminal 1: backend
DATABRICKS_PROFILE=<your-profile> python3 -m uvicorn app:app --port 8000
# terminal 2: vite dev server (proxies /api -> :8000)
cd frontend && npm run dev   # http://localhost:5173
```

## Authentication

`server/config.py` detects its environment:

- **Local**: uses your Databricks CLI profile (`WorkspaceClient(profile=...)`).
- **Databricks App**: uses the app's injected credentials. The app runs read-only
  as its service principal for both the SQL warehouse and the serving endpoint,
  so every viewer is served without per-user grants.

## Deploy to Databricks Apps

The `app.yaml` declares the SQL warehouse via a `valueFrom` key (`sql-warehouse`)
that must match the resource key configured on the app. The serving endpoint is
passed by name.

```bash
# with Databricks CLI >= 0.229.0
databricks apps create claims-analytics -p <your-profile>

databricks sync . /Workspace/Users/<your-username>/claims-analytics \
  --exclude node_modules --exclude .venv --exclude __pycache__ \
  --exclude frontend/node_modules --exclude .git -p <your-profile>

databricks apps deploy claims-analytics \
  --source-code-path /Workspace/Users/<your-username>/claims-analytics \
  -p <your-profile>
```

After creating the app, add these resources to it (in the UI or via `apps update`):

- a **SQL warehouse** resource with key `sql-warehouse`, permission CAN USE
- a **Serving endpoint** resource for your Foundation Model endpoint, permission CAN QUERY

The app's service principal needs:
- `USE CATALOG` / `USE SCHEMA` / `SELECT` on your catalog and schema
- `CAN USE` on the SQL warehouse
- `CAN QUERY` on the serving endpoint

## Notes / v1 scope

- The AI panels are a single LLM call over precomputed aggregates. `insights.py`
  is intentionally modular so it can become an Agent Framework agent later.
- Warehouse results are cached in-process for 5 minutes.
