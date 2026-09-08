import React, { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { getJSON, fmtUSD, fmtUSDfull, fmtNum, fmtPct } from "./api";
import { Kpi, AIPanel } from "./components.jsx";

const STATUS_COLOR = { Closed: "#8895a1", "In Process": "#1b5e8c", Hold: "#c47f17" };
const AGE_COLOR = { "0-30": "#2e844a", "31-60": "#c47f17", "61-90": "#e0662b", "90+": "#c0392b" };

export default function AgingTab() {
  const [kpis, setKpis] = useState(null);
  const [charts, setCharts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getJSON("/aging/kpis"), getJSON("/aging/charts")])
      .then(([k, c]) => { setKpis(k); setCharts(c); })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">Failed to load: {error}</div>;
  if (!kpis) return <div className="loading">Loading claims aging data...</div>;

  return (
    <div>
      <div className="kpi-row">
        <Kpi label="Total Claims" value={fmtNum(kpis.total_claims)} foot="audited claims" />
        <Kpi label="Open Backlog" value={fmtNum(kpis.open_backlog)} foot="In Process + Hold" />
        <Kpi label="% Adjudicated" value={fmtPct(kpis.pct_adjudicated)} foot="have an adjudication date" />
        <Kpi label="Avg Turnaround" value={`${fmtNum(kpis.avg_turnaround_days)} d`} foot="received → adjudicated" />
        <Kpi label="Open $ Exposure" value={fmtUSD(kpis.open_exposure)}
          foot={`${fmtUSDfull(kpis.open_exposure)} billed, un-adjudicated`} />
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Backlog by Claim Status</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={charts.backlog_by_status} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="claim_statusgroup" fontSize={12} />
              <YAxis tickFormatter={fmtNum} fontSize={11} />
              <Tooltip formatter={(v) => fmtNum(v)} />
              <Bar dataKey="claims" name="Claims">
                {charts.backlog_by_status.map((d, i) => (
                  <Cell key={i} fill={STATUS_COLOR[d.claim_statusgroup] || "#1b5e8c"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>Adjudication Turnaround Distribution</h3>
          <div className="card-sub">Days from received to adjudicated (adjudicated claims)</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={charts.turnaround_dist} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" fontSize={12} />
              <YAxis tickFormatter={fmtNum} fontSize={11} />
              <Tooltip formatter={(v) => fmtNum(v)} />
              <Bar dataKey="claims" name="Claims" fill="#1b5e8c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Open-Claim Aging Buckets</h3>
          <div className="card-sub">Days since received (open claims only), relative to latest received date</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={charts.open_aging} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" fontSize={12} />
              <YAxis yAxisId="l" tickFormatter={fmtNum} fontSize={11} />
              <Tooltip formatter={(v, n) => (n === "Exposure" ? fmtUSDfull(v) : fmtNum(v))} />
              <Bar yAxisId="l" dataKey="claims" name="Claims">
                {charts.open_aging.map((d, i) => (
                  <Cell key={i} fill={AGE_COLOR[d.bucket] || "#1b5e8c"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>Open Backlog by State</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={charts.backlog_by_state} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={fmtNum} fontSize={11} />
              <YAxis type="category" dataKey="source_state" width={50} fontSize={11} />
              <Tooltip formatter={(v) => fmtNum(v)} />
              <Bar dataKey="claims" name="Open Claims" fill="#1b5e8c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <AIPanel
        title="AI Summary"
        subtitle="Claims aging & backlog insights over the current aggregates"
        endpoint="/insights/aging"
      />
    </div>
  );
}
