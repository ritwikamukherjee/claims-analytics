"""AI insight generation: gather aggregates -> build prompt -> single LLM call.

Modular by design so each `*_insight` function can later become a tool/agent
in the Agent Framework.
"""
import json

from . import data
from .llm import call_llm


def _fmt(obj) -> str:
    return json.dumps(obj, indent=2, default=str)


def aging_insight(user_token: str | None = None) -> dict:
    kpis = data.aging_kpis()
    charts = data.aging_charts()
    aggregates = {
        "kpis": kpis,
        "backlog_by_status": charts["backlog_by_status"],
        "open_claim_aging_buckets": charts["open_aging"],
        "turnaround_distribution_days": charts["turnaround_dist"],
        "backlog_by_state": charts["backlog_by_state"][:10],
    }
    prompt = (
        "Analyze the claims aging and adjudication backlog. Note that "
        "adjudication turnaround is tight (0-30 days), so focus on the size and "
        "composition of the open backlog (In Process + Hold), open dollar "
        "exposure, aging of still-open claims relative to the latest received "
        "date, and which states carry the most backlog. Avoid overstating aging.\n\n"
        f"DATA:\n{_fmt(aggregates)}"
    )
    summary = call_llm(prompt, user_token=user_token)
    return {"summary": summary, "aggregates_used": aggregates}


def denials_insight(user_token: str | None = None) -> dict:
    kpis = data.denials_kpis()
    charts = data.denials_charts()
    aggregates = {
        "kpis": kpis,
        "denial_rate_by_month": charts["denial_trend"],
        "top_denial_reasons": charts["top_reasons"],
        "auto_adjudication_breakdown": charts["auto_adj"],
        "denial_rate_by_state_lob": charts["by_state_lob"],
    }
    prompt = (
        "Analyze the claims denial trends and auto-adjudication performance. "
        "Summarize the overall denial rate, zero-pay rate, edit-fire rate, and "
        "auto-adjudication (PASS vs FAIL/OVERRIDE) rate, the denial-rate trend "
        "over time, the leading denial reasons, and where denials concentrate by "
        "state/line-of-business. Explicitly connect how denials and manual edits "
        "drive downstream rework.\n\n"
        f"DATA:\n{_fmt(aggregates)}"
    )
    summary = call_llm(prompt, user_token=user_token)
    return {"summary": summary, "aggregates_used": aggregates}


def rework_insight(user_token: str | None = None) -> dict:
    kpis = data.rework_kpis()
    trends = data.rework_trends()
    providers = data.rework_providers()

    aggregates = {
        "kpis": {k: v for k, v in kpis.items() if k != "mor_summary"},
        "impact_by_root_cause": trends["by_cause"],
        "monthly_trend": trends["by_month"][-12:],
        "top_providers_by_impact": providers,
    }
    prompt = (
        "Analyze the following CIM/TCIM claims rework and root-cause aggregates. "
        "Summarize the financial impact, the top controllable drivers, "
        "the monthly trend direction, and provider concentration. Comment on the "
        "AI root-cause classification accuracy.\n\n"
        f"DATA:\n{_fmt(aggregates)}"
    )
    summary = call_llm(prompt, user_token=user_token)
    return {"summary": summary, "aggregates_used": aggregates}


def monitoring_insight(change_id: str, user_token: str | None = None) -> dict:
    scorecard = [
        r for r in data.monitoring_scorecard() if r["change_id"] == change_id
    ]
    row = scorecard[0] if scorecard else {}
    anomalies = data.monitoring_anomalies(change_id)
    summary_row = data.monitoring_summary_row(change_id)
    daily = data.monitoring_daily(change_id)

    # Compress daily to baseline vs monitoring averages to keep the prompt tight.
    def avg(period, field):
        vals = [d[field] for d in daily if d["period"] == period and d[field] is not None]
        return round(sum(vals) / len(vals), 4) if vals else None

    aggregates = {
        "change": {
            k: row.get(k)
            for k in (
                "change_id", "change_type", "source_state", "line_of_business",
                "risk_tier", "monitoring_status", "base_denial_rate",
                "mon_denial_rate", "denial_delta", "paid_pct_change",
                "anomaly_detected",
            )
        },
        "daily_avg": {
            "baseline_denial_rate": avg("Baseline", "denial_rate"),
            "monitoring_denial_rate": avg("Monitoring", "denial_rate"),
            "baseline_avg_paid": avg("Baseline", "avg_paid"),
            "monitoring_avg_paid": avg("Monitoring", "avg_paid"),
        },
        "anomalies": anomalies,
    }
    prompt = (
        f"Analyze the post-deployment monitoring results for config change "
        f"{change_id}. Explain whether the change introduced a claims-processing "
        f"anomaly (denial-rate, zero-pay, edit-fire, or paid-amount shift), how "
        f"severe it is, and the likely operational implication.\n\n"
        f"DATA:\n{_fmt(aggregates)}"
    )
    summary = call_llm(prompt, user_token=user_token)
    return {
        "summary": summary,
        "seeded_finding": summary_row.get("monitoring_finding") if summary_row else None,
        "aggregates_used": aggregates,
    }
