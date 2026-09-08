"""Dual-mode auth + configuration for the Claims Analytics app.

Runs both locally (using a Databricks CLI profile) and inside a Databricks App
(using the auto-injected service principal / on-behalf-of-user token).
"""
import os
from functools import lru_cache
from databricks.sdk import WorkspaceClient

# ---- Static config (set these via env / app resources) ------------------
# In a Databricks App, DATABRICKS_WAREHOUSE_ID comes from a "SQL warehouse"
# resource (valueFrom), and the catalog/schema/endpoint come from app.yaml env.
WAREHOUSE_ID = os.environ.get("DATABRICKS_WAREHOUSE_ID", "")
CATALOG = os.environ.get("UC_CATALOG", "main")
SCHEMA = os.environ.get("UC_SCHEMA", "claims_analytics")
SERVING_ENDPOINT = os.environ.get("SERVING_ENDPOINT", "databricks-claude-sonnet-4-6")
DATABRICKS_PROFILE = os.environ.get("DATABRICKS_PROFILE", "DEFAULT")

# Databricks Apps sets DATABRICKS_APP_NAME (or app-specific vars) at runtime.
IS_DATABRICKS_APP = bool(
    os.environ.get("DATABRICKS_APP_NAME") or os.environ.get("DATABRICKS_APP_PORT")
)


def fq(table: str) -> str:
    """Fully-qualified table name."""
    return f"`{CATALOG}`.`{SCHEMA}`.`{table}`"


@lru_cache(maxsize=1)
def get_workspace_client() -> WorkspaceClient:
    """App-level (service principal / profile) WorkspaceClient."""
    if IS_DATABRICKS_APP:
        return WorkspaceClient()
    return WorkspaceClient(profile=DATABRICKS_PROFILE)


def get_workspace_host() -> str:
    """Workspace host URL, always with an https:// scheme."""
    if IS_DATABRICKS_APP:
        host = os.environ.get("DATABRICKS_HOST", "")
        if host and not host.startswith("http"):
            host = f"https://{host}"
        if host:
            return host
    return get_workspace_client().config.host


def get_token(user_token: str | None = None) -> str:
    """Return a bearer token for the app's service-principal calls.

    The app runs READ-ONLY as its service principal for both SQL and model
    serving. We intentionally ignore the on-behalf-of-user token here: Databricks
    Apps OBO tokens only carry the scopes the app declares (typically `sql`) and
    lack `model-serving`, which 403s the serving endpoint. The app SP has
    read-only UC SELECT, warehouse CAN USE, and endpoint CAN QUERY, so it can
    serve every viewer without per-user grants. (user_token kept for signature
    compatibility; not used for auth.)
    """
    w = get_workspace_client()
    if w.config.token:
        return w.config.token
    auth = w.config.authenticate()
    if auth and "Authorization" in auth:
        return auth["Authorization"].replace("Bearer ", "")
    raise RuntimeError("Could not obtain a Databricks token")
