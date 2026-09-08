"""Claims Analytics - FastAPI entry point.

Serves the JSON API and the built React SPA. Runs locally with a Databricks
CLI profile and unchanged inside a Databricks App.
"""
import os

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from server import data, insights

app = FastAPI(title="Claims Analytics")


def _fwd_token(x_forwarded_access_token: str | None) -> str | None:
    """On-behalf-of-user token when running in a Databricks App; None locally."""
    return x_forwarded_access_token


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"error": str(exc)})


@app.get("/api/health")
def health():
    return {"status": "ok"}


# --------------------------- Tab 1: Aging ---------------------------
@app.get("/api/aging/kpis")
def aging_kpis():
    return data.aging_kpis()


@app.get("/api/aging/charts")
def aging_charts():
    return data.aging_charts()


# ------------------------- Tab 2: Denials ---------------------------
@app.get("/api/denials/kpis")
def denials_kpis():
    return data.denials_kpis()


@app.get("/api/denials/charts")
def denials_charts():
    return data.denials_charts()


# ------------------------------- Tab 3 -------------------------------
@app.get("/api/rework/kpis")
def rework_kpis():
    return data.rework_kpis()


@app.get("/api/rework/trends")
def rework_trends():
    return data.rework_trends()


@app.get("/api/rework/providers")
def rework_providers():
    return data.rework_providers()


@app.get("/api/rework/tickets")
def rework_tickets():
    return data.rework_tickets()


# ------------------------------- Tab 2 -------------------------------
@app.get("/api/monitoring/kpis")
def monitoring_kpis():
    return data.monitoring_kpis()


@app.get("/api/monitoring/scorecard")
def monitoring_scorecard():
    return data.monitoring_scorecard()


@app.get("/api/monitoring/daily")
def monitoring_daily(change_id: str):
    return data.monitoring_daily(change_id)


@app.get("/api/monitoring/anomalies")
def monitoring_anomalies(change_id: str | None = None):
    return data.monitoring_anomalies(change_id)


# ------------------------------ Insights -----------------------------
@app.get("/api/insights/aging")
def insights_aging(x_forwarded_access_token: str | None = Header(default=None)):
    return insights.aging_insight(user_token=_fwd_token(x_forwarded_access_token))


@app.get("/api/insights/denials")
def insights_denials(x_forwarded_access_token: str | None = Header(default=None)):
    return insights.denials_insight(user_token=_fwd_token(x_forwarded_access_token))


@app.get("/api/insights/rework")
def insights_rework(x_forwarded_access_token: str | None = Header(default=None)):
    return insights.rework_insight(user_token=_fwd_token(x_forwarded_access_token))


@app.get("/api/insights/monitoring")
def insights_monitoring(
    change_id: str,
    x_forwarded_access_token: str | None = Header(default=None),
):
    return insights.monitoring_insight(
        change_id, user_token=_fwd_token(x_forwarded_access_token)
    )


# --------------------------- Serve frontend --------------------------
_FRONTEND = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(_FRONTEND):
    app.mount(
        "/assets", StaticFiles(directory=os.path.join(_FRONTEND, "assets")), name="assets"
    )

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(os.path.join(_FRONTEND, "index.html"))
