import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { getJSON, fmtNum, fmtPct, fmtRate, fmtUSDfull } from "./api";
import { Kpi, Pill, severityPill, AIPanel } from "./components.jsx";

export default function MonitoringTab() {
  const [kpis, setKpis] = useState(null);
  const [scorecard, setScorecard] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState("");
  const [daily, setDaily] = useState(null);
  const [anomalies, setAnomalies] = useState(null);

  useEffect(() => {
    Promise.all([getJSON("/monitoring/kpis"), getJSON("/monitoring/scorecard")])
      .then(([k, sc]) => {
        setKpis(k);
        setScorecard(sc);
        // default select the first change that has an anomaly, else first row
        const first = sc.find((r) => r.anomaly_detected) || sc[0];
        if (first) setSelected(first.change_id);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setDaily(null);
    setAnomalies(null);
    Promise.all([
      getJSON(`/monitoring/daily?change_id=${selected}`),
      getJSON(`/monitoring/anomalies?change_id=${selected}`),
    ])
      .then(([d, a]) => { setDaily(d); setAnomalies(a); })
      .catch((e) => setError(e.message));
  }, [selected]);

  // Merge baseline vs monitoring daily denial_rate by relative_day
  const chartData = useMemo(() => {
    if (!daily) return [];
    const byDay = {};
    daily.forEach((r) => {
      const d = (byDay[r.relative_day] = byDay[r.relative_day] || { relative_day: r.relative_day });
      if (r.period === "Baseline") d.baseline = r.denial_rate;
      else d.monitoring = r.denial_rate;
    });
    return Object.values(byDay).sort((a, b) => a.relative_day - b.relative_day);
  }, [daily]);

  const selectedRow = useMemo(
    () => (scorecard || []).find((r) => r.change_id === selected),
    [scorecard, selected]
  );

  if (error) return <div className="error">Failed to load: {error}</div>;
  if (!kpis) return <div className="loading">Loading monitoring data...</div>;

  return (
    <div>
      <div className="kpi-row">
        <Kpi label="Total Changes" value={fmtNum(kpis.total_changes)} foot="monitored config changes" />
        <Kpi label="Changes w/ Anomaly" value={fmtNum(kpis.changes_with_anomaly)} foot="anomaly_detected = true" />
        <Kpi label="Total Anomalies" value={fmtNum(kpis.total_anomalies)} foot="across all changes" />
        <Kpi label="High-Severity Anomalies" value={fmtNum(kpis.high_severity_anomalies)} foot="severity = High" />
        <Kpi label="Detection Accuracy" value={fmtPct(kpis.anomaly_detection_accuracy)}
          foot="detected = seeded" />
      </div>

      <div className="card">
        <h3>Change Scorecard</h3>
        <div className="card-sub">Denial-rate delta and anomaly flags. Sorted by anomalies, then |denial delta|.</div>
        <div style={{ overflowX: "auto", maxHeight: 340, overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Change</th><th>Type</th><th>State</th><th>LOB</th><th>Risk</th>
                <th className="num">Base Denial</th><th className="num">Mon Denial</th>
                <th className="num">&Delta; Denial</th><th className="num">Paid %&Delta;</th>
                <th>Detected</th><th>Seeded</th>
              </tr>
            </thead>
            <tbody>
              {(scorecard || []).map((r) => (
                <tr key={r.change_id}
                  onClick={() => setSelected(r.change_id)}
                  style={{ cursor: "pointer", background: r.change_id === selected ? "#eef4f8" : undefined }}>
                  <td>{r.change_id}</td>
                  <td>{r.change_type}</td>
                  <td>{r.source_state}</td>
                  <td>{r.line_of_business}</td>
                  <td><Pill kind={r.risk_tier === "High" ? "red" : r.risk_tier === "Medium" ? "amber" : "gray"}>{r.risk_tier}</Pill></td>
                  <td className="num">{fmtRate(r.base_denial_rate)}</td>
                  <td className="num">{fmtRate(r.mon_denial_rate)}</td>
                  <td className="num" style={{ color: r.denial_delta > 0.02 ? "#c0392b" : undefined }}>
                    {r.denial_delta > 0 ? "+" : ""}{fmtRate(r.denial_delta)}
                  </td>
                  <td className="num">{r.paid_pct_change > 0 ? "+" : ""}{fmtRate(r.paid_pct_change)}</td>
                  <td>{r.anomaly_detected ? <Pill kind="red">Yes</Pill> : <Pill kind="gray">No</Pill>}</td>
                  <td>{r.seeded_anomaly ? <Pill kind="amber">{r.seeded_anomaly_type || "Yes"}</Pill> : <Pill kind="gray">No</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="controls">
        <label htmlFor="change-select" style={{ fontWeight: 600 }}>Selected change:</label>
        <select id="change-select" name="change-select" value={selected}
          onChange={(e) => setSelected(e.target.value)}>
          {(scorecard || []).map((r) => (
            <option key={r.change_id} value={r.change_id}>
              {r.change_id} — {r.change_type} ({r.source_state}/{r.line_of_business})
              {r.anomaly_detected ? " ⚠" : ""}
            </option>
          ))}
        </select>
        {selectedRow && (
          <span style={{ color: "#66707a", fontSize: 12 }}>
            {selectedRow.change_type} · risk {selectedRow.risk_tier} · {selectedRow.monitoring_status}
          </span>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Daily Denial Rate — Baseline vs Monitoring</h3>
          <div className="card-sub">Change {selected}</div>
          {!daily ? (
            <div className="loading">Loading daily metrics...</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="relative_day" fontSize={11}
                  label={{ value: "relative day", position: "insideBottom", offset: -3, fontSize: 10 }} />
                <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} fontSize={11} />
                <Tooltip formatter={(v) => fmtRate(v)} />
                <Legend fontSize={11} />
                <Line type="monotone" dataKey="baseline" name="Baseline" stroke="#8895a1"
                  strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="monitoring" name="Monitoring" stroke="#c0392b"
                  strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3>Detected Anomalies</h3>
          <div className="card-sub">Change {selected}</div>
          {!anomalies ? (
            <div className="loading">Loading...</div>
          ) : anomalies.length === 0 ? (
            <div className="ai-empty">No anomalies recorded for this change.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Anomaly Type</th><th>Severity</th>
                  <th className="num">Baseline</th><th className="num">Monitoring</th><th className="num">&Delta;</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((a, i) => (
                  <tr key={i}>
                    <td>{a.anomaly_type}</td>
                    <td>{severityPill(a.severity)}</td>
                    <td className="num">{Number(a.baseline_val).toFixed(4)}</td>
                    <td className="num">{Number(a.monitoring_val).toFixed(4)}</td>
                    <td className="num" style={{ color: a.delta > 0 ? "#c0392b" : "#2e844a" }}>
                      {a.delta > 0 ? "+" : ""}{Number(a.delta).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AIPanel
        key={selected}
        title="AI Findings"
        subtitle={`Post-deployment analysis for change ${selected}`}
        endpoint={`/insights/monitoring?change_id=${selected}`}
        buttonLabel="Generate findings"
      />
    </div>
  );
}
