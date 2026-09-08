"""SQL warehouse query helper with a small in-process TTL cache."""
import time
from typing import Any

from databricks.sdk.service.sql import StatementState

from .config import WAREHOUSE_ID, get_workspace_client

_CACHE: dict[str, tuple[float, Any]] = {}
_TTL_SECONDS = 300  # 5 minutes


def _run(sql: str) -> list[dict]:
    w = get_workspace_client()
    r = w.statement_execution.execute_statement(
        statement=sql, warehouse_id=WAREHOUSE_ID, wait_timeout="50s"
    )
    while r.status.state in (StatementState.PENDING, StatementState.RUNNING):
        time.sleep(0.5)
        r = w.statement_execution.get_statement(r.statement_id)
    if r.status.state != StatementState.SUCCEEDED:
        raise RuntimeError(
            f"Query failed: {r.status.error.message if r.status.error else r.status.state}"
        )
    if not r.manifest or not r.manifest.schema:
        return []
    cols = [c.name for c in r.manifest.schema.columns]
    types = {c.name: c.type_name.value for c in r.manifest.schema.columns}
    rows = (r.result.data_array if r.result else None) or []
    out = []
    for row in rows:
        rec = {}
        for c, v in zip(cols, row):
            rec[c] = _coerce(v, types.get(c, "STRING"))
        out.append(rec)
    return out


_NUMERIC = {"INT", "LONG", "SHORT", "BYTE", "FLOAT", "DOUBLE", "DECIMAL"}


def _coerce(v, type_name: str):
    if v is None:
        return None
    if type_name in _NUMERIC:
        try:
            f = float(v)
            return int(f) if f.is_integer() else f
        except (ValueError, TypeError):
            return v
    if type_name == "BOOLEAN":
        return str(v).lower() == "true"
    return v


def query(sql: str, cache: bool = True) -> list[dict]:
    """Execute SQL and return list of dict rows. Cached by SQL text for TTL."""
    if cache:
        hit = _CACHE.get(sql)
        if hit and (time.time() - hit[0]) < _TTL_SECONDS:
            return hit[1]
    result = _run(sql)
    if cache:
        _CACHE[sql] = (time.time(), result)
    return result
