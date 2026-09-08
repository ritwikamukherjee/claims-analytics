"""Data access: SQL queries against the Gold tables, one function per endpoint."""
from .config import fq
from .warehouse import query


# ======================= TAB 1: CLAIMS AGING =======================

def aging_kpis() -> dict:
    t = fq("claims_audit_consolidated")
    row = query(
        f"""
        SELECT
          COUNT(DISTINCT claim_id) AS total_claims,
          COUNT(DISTINCT CASE WHEN claim_statusgroup IN ('In Process','Hold') THEN claim_id END) AS open_backlog,
          ROUND(100.0 * COUNT(DISTINCT CASE WHEN claim_adjudicationdate IS NOT NULL THEN claim_id END)
                / COUNT(DISTINCT claim_id), 1) AS pct_adjudicated,
          ROUND(AVG(CASE WHEN claim_adjudicationdate IS NOT NULL
                THEN datediff(claim_adjudicationdate, claim_receiveddate) END), 1) AS avg_turnaround_days,
          SUM(CASE WHEN claim_adjudicationdate IS NULL THEN claim_billedamount ELSE 0 END) AS open_exposure
        FROM {t}
        """
    )[0]
    return row


def aging_charts() -> dict:
    t = fq("claims_audit_consolidated")
    backlog_by_status = query(
        f"""
        SELECT claim_statusgroup, COUNT(DISTINCT claim_id) AS claims
        FROM {t}
        GROUP BY claim_statusgroup
        ORDER BY claims DESC
        """
    )
    turnaround_dist = query(
        f"""
        SELECT bucket, COUNT(*) AS claims FROM (
          SELECT claim_id,
            CASE
              WHEN d <= 5 THEN '0-5'
              WHEN d <= 10 THEN '6-10'
              WHEN d <= 15 THEN '11-15'
              WHEN d <= 20 THEN '16-20'
              WHEN d <= 25 THEN '21-25'
              ELSE '26-30' END AS bucket
          FROM (
            SELECT claim_id, datediff(MIN(claim_adjudicationdate), MIN(claim_receiveddate)) AS d
            FROM {t}
            WHERE claim_adjudicationdate IS NOT NULL
            GROUP BY claim_id
          )
        )
        GROUP BY bucket
        ORDER BY CASE bucket
          WHEN '0-5' THEN 1 WHEN '6-10' THEN 2 WHEN '11-15' THEN 3
          WHEN '16-20' THEN 4 WHEN '21-25' THEN 5 ELSE 6 END
        """
    )
    # Open-claim aging relative to the dataset's max received date.
    open_aging = query(
        f"""
        WITH mx AS (SELECT MAX(claim_receiveddate) AS m FROM {t})
        SELECT bucket, COUNT(*) AS claims, ROUND(SUM(billed),0) AS exposure FROM (
          SELECT c.claim_id,
            CASE
              WHEN datediff(mx.m, MIN(c.claim_receiveddate)) <= 30 THEN '0-30'
              WHEN datediff(mx.m, MIN(c.claim_receiveddate)) <= 60 THEN '31-60'
              WHEN datediff(mx.m, MIN(c.claim_receiveddate)) <= 90 THEN '61-90'
              ELSE '90+' END AS bucket,
            MAX(c.claim_billedamount) AS billed
          FROM {t} c CROSS JOIN mx
          WHERE c.claim_adjudicationdate IS NULL
          GROUP BY c.claim_id, mx.m
        )
        GROUP BY bucket
        ORDER BY CASE bucket WHEN '0-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3 ELSE 4 END
        """
    )
    backlog_by_state = query(
        f"""
        SELECT source_state, COUNT(DISTINCT claim_id) AS claims
        FROM {t}
        WHERE claim_statusgroup IN ('In Process','Hold')
        GROUP BY source_state
        ORDER BY claims DESC
        """
    )
    return {
        "backlog_by_status": backlog_by_status,
        "turnaround_dist": turnaround_dist,
        "open_aging": open_aging,
        "backlog_by_state": backlog_by_state,
    }


# ============ TAB 2: DENIAL TRENDS & AUTO-ADJUDICATION ============

def denials_kpis() -> dict:
    pp = fq("postprod_claims")
    ca = fq("claims_audit_consolidated")
    trend = query(
        f"""
        SELECT
          ROUND(100.0 * SUM(CASE WHEN is_denied THEN 1 ELSE 0 END) / COUNT(*), 1) AS denial_rate,
          ROUND(100.0 * SUM(CASE WHEN is_zero_pay THEN 1 ELSE 0 END) / COUNT(*), 1) AS zero_pay_rate,
          ROUND(100.0 * SUM(CASE WHEN edit_fired THEN 1 ELSE 0 END) / COUNT(*), 1) AS edit_fire_rate,
          COUNT(*) AS claims
        FROM {pp}
        """
    )[0]
    auto = query(
        f"""
        SELECT ROUND(100.0 * SUM(CASE WHEN edit_status = 'PASS' THEN 1 ELSE 0 END)
               / SUM(CASE WHEN edit_status IN ('PASS','FAIL','OVERRIDE') THEN 1 ELSE 0 END), 1) AS auto_adj_rate
        FROM {ca}
        """
    )[0]
    return {
        "denial_rate": trend.get("denial_rate"),
        "zero_pay_rate": trend.get("zero_pay_rate"),
        "auto_adjudication_rate": auto.get("auto_adj_rate"),
        "edit_fire_rate": trend.get("edit_fire_rate"),
        "postprod_claims": trend.get("claims"),
    }


def denials_charts() -> dict:
    pp = fq("postprod_claims")
    ca = fq("claims_audit_consolidated")
    denial_trend = query(
        f"""
        SELECT date_format(processed_date, 'yyyy-MM') AS month,
               ROUND(100.0 * SUM(CASE WHEN is_denied THEN 1 ELSE 0 END) / COUNT(*), 2) AS denial_rate,
               ROUND(100.0 * SUM(CASE WHEN is_zero_pay THEN 1 ELSE 0 END) / COUNT(*), 2) AS zero_pay_rate,
               COUNT(*) AS claims
        FROM {pp}
        GROUP BY date_format(processed_date, 'yyyy-MM')
        ORDER BY month
        """
    )
    top_reasons = query(
        f"""
        SELECT denial_reason_desc AS reason, COUNT(*) AS cnt
        FROM {ca}
        WHERE denial_reason_desc IS NOT NULL
        GROUP BY denial_reason_desc
        ORDER BY cnt DESC
        LIMIT 10
        """
    )
    auto_adj = query(
        f"""
        SELECT edit_status, COUNT(*) AS cnt
        FROM {ca}
        WHERE edit_status IS NOT NULL
        GROUP BY edit_status
        ORDER BY cnt DESC
        """
    )
    by_state_lob = query(
        f"""
        SELECT source_state, line_of_business,
               ROUND(100.0 * SUM(CASE WHEN is_denied THEN 1 ELSE 0 END) / COUNT(*), 1) AS denial_rate,
               COUNT(*) AS claims
        FROM {pp}
        GROUP BY source_state, line_of_business
        HAVING COUNT(*) > 100
        ORDER BY denial_rate DESC
        LIMIT 12
        """
    )
    return {
        "denial_trend": denial_trend,
        "top_reasons": top_reasons,
        "auto_adj": auto_adj,
        "by_state_lob": by_state_lob,
    }


# ============================ TAB 3: REWORK ============================

def rework_kpis() -> dict:
    summary = query(f"SELECT claims, impact, pct_controllable, mor_summary FROM {fq('rework_mor_summary')} LIMIT 1")
    summary = summary[0] if summary else {}

    tickets = query(
        f"""
        SELECT
          COUNT(*) AS total_tickets,
          SUM(CASE WHEN ticket_status IN ('Open','In Progress') THEN 1 ELSE 0 END) AS open_in_progress,
          SUM(financial_impact) AS total_impact
        FROM {fq('rework_tickets')}
        """
    )[0]

    acc = query(
        f"""
        SELECT
          ROUND(100.0 * SUM(CASE WHEN ai_root_cause_category = seeded_category THEN 1 ELSE 0 END) / COUNT(*), 1) AS ai_accuracy,
          COUNT(*) AS n
        FROM {fq('rework_root_cause_gold')}
        """
    )[0]

    return {
        "total_impact": summary.get("impact"),
        "claim_count": summary.get("claims"),
        "pct_controllable": summary.get("pct_controllable"),
        "open_in_progress_tickets": tickets.get("open_in_progress"),
        "total_tickets": tickets.get("total_tickets"),
        "ai_root_cause_accuracy": acc.get("ai_accuracy"),
        "ai_eval_n": acc.get("n"),
        "mor_summary": summary.get("mor_summary"),
    }


def rework_trends() -> dict:
    by_cause = query(
        f"""
        SELECT root_cause, controllability, tickets, total_impact, avg_impact, interest_paid
        FROM {fq('rework_trend_by_cause')}
        ORDER BY total_impact DESC
        """
    )
    by_month = query(
        f"""
        SELECT date_format(rework_month, 'yyyy-MM') AS rework_month,
               SUM(total_impact) AS total_impact,
               SUM(rework_claims) AS rework_claims,
               SUM(interest_paid) AS interest_paid
        FROM {fq('rework_trend_by_segment')}
        GROUP BY date_format(rework_month, 'yyyy-MM')
        ORDER BY rework_month
        """
    )
    return {"by_cause": by_cause, "by_month": by_month}


def rework_providers() -> list[dict]:
    return query(
        f"""
        SELECT rendering_id, rendering_name, source_state, line_of_business,
               rework_tickets, total_impact, top_root_cause
        FROM {fq('rework_trend_by_provider')}
        ORDER BY total_impact DESC
        LIMIT 10
        """
    )


def rework_tickets() -> dict:
    by_status_priority = query(
        f"""
        SELECT ticket_status, priority, COUNT(*) AS cnt, SUM(financial_impact) AS impact
        FROM {fq('rework_tickets')}
        GROUP BY ticket_status, priority
        ORDER BY ticket_status, priority
        """
    )
    recent = query(
        f"""
        SELECT ritm_id, claim_id, ticket_status, priority, assigned_team,
               financial_impact, date_format(opened_date, 'yyyy-MM-dd') AS opened_date,
               date_format(closed_date, 'yyyy-MM-dd') AS closed_date, seeded_controllable
        FROM {fq('rework_tickets')}
        ORDER BY financial_impact DESC
        LIMIT 25
        """
    )
    return {"by_status_priority": by_status_priority, "recent": recent}


# ========================= TAB 2: MONITORING =========================

def monitoring_kpis() -> dict:
    sc = query(
        f"""
        SELECT
          COUNT(*) AS total_changes,
          SUM(CASE WHEN anomaly_detected THEN 1 ELSE 0 END) AS changes_with_anomaly,
          ROUND(100.0 * SUM(CASE WHEN anomaly_detected = seeded_anomaly THEN 1 ELSE 0 END) / COUNT(*), 1) AS detection_accuracy
        FROM {fq('monitoring_change_scorecard')}
        """
    )[0]
    an = query(
        f"""
        SELECT
          COUNT(*) AS total_anomalies,
          SUM(CASE WHEN severity = 'High' THEN 1 ELSE 0 END) AS high_severity
        FROM {fq('monitoring_anomalies_gold')}
        """
    )[0]
    return {
        "total_changes": sc.get("total_changes"),
        "changes_with_anomaly": sc.get("changes_with_anomaly"),
        "total_anomalies": an.get("total_anomalies"),
        "high_severity_anomalies": an.get("high_severity"),
        "anomaly_detection_accuracy": sc.get("detection_accuracy"),
    }


def monitoring_scorecard() -> list[dict]:
    return query(
        f"""
        SELECT change_id, change_type, source_state, line_of_business, risk_tier,
               monitoring_status, base_denial_rate, mon_denial_rate, denial_delta,
               base_avg_paid, mon_avg_paid, paid_pct_change,
               anomaly_detected, seeded_anomaly, seeded_anomaly_type
        FROM {fq('monitoring_change_scorecard')}
        ORDER BY (CASE WHEN anomaly_detected THEN 1 ELSE 0 END) DESC, ABS(denial_delta) DESC
        """
    )


def monitoring_daily(change_id: str) -> list[dict]:
    safe = change_id.replace("'", "")
    return query(
        f"""
        SELECT period, relative_day, claims, denial_rate, zero_pay_rate, edit_rate, avg_paid
        FROM {fq('monitoring_daily_metrics')}
        WHERE change_id = '{safe}'
        ORDER BY relative_day
        """
    )


def monitoring_anomalies(change_id: str | None = None) -> list[dict]:
    where = ""
    if change_id:
        safe = change_id.replace("'", "")
        where = f"WHERE change_id = '{safe}'"
    return query(
        f"""
        SELECT change_id, anomaly_type, severity, baseline_val, monitoring_val, delta
        FROM {fq('monitoring_anomalies_gold')}
        {where}
        ORDER BY (CASE severity WHEN 'High' THEN 3 WHEN 'Medium' THEN 2 ELSE 1 END) DESC
        """
    )


def monitoring_summary_row(change_id: str) -> dict | None:
    safe = change_id.replace("'", "")
    rows = query(
        f"""
        SELECT change_id, change_type, line_of_business, risk_tier, n_anomalies,
               top_severity, monitoring_finding
        FROM {fq('monitoring_summary_gold')}
        WHERE change_id = '{safe}'
        LIMIT 1
        """
    )
    return rows[0] if rows else None
