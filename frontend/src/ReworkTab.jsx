import React, { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, Cell, Legend,
} from "recharts";
import { getJSON, fmtUSD, fmtUSDfull, fmtNum, fmtPct } from "./api";
import { Kpi, Pill, AIPanel } from "./components.jsx";

const CTRL_COLOR = { Controllable: "#c0392b", "Non-Controllable": "#8895a1" };

export default function ReworkTab() {
  const [kpis, setKpis] = useState(null);
  const [trends, setTrends] = useState(null);
  const [providers, setProviders] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      getJSON("/rework/kpis"),
      getJSON("/rework/trends"),
      getJSON("/rework/providers"),
      getJSON("/rework/tickets"),
    ])
      .then(([k, tr, p, ti]) => {
        setKpis(k); setTrends(tr); setProviders(p); setTickets(ti);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">Failed to load: {error}</div>;
  if (!kpis) return <div className="loading">Loading rework data...</div>;

  // Ticket status breakdown by priority -> stacked bar keyed by priority
  const statusMap = {};
  const priorities = new Set();
  (tickets?.by_status_priority || []).forEach((r) => {
    priorities.add(r.priority);
    statusMap[r.ticket_status] = statusMap[r.ticket_status] || { ticket_status: r.ticket_status };
    statusMap[r.ticket_status][r.priority] = r.cnt;
  });
  const statusData = Object.values(statusMap);
  const prioList = [...priorities].sort();
  const prioColors = ["#c0392b", "#e08e0b", "#1b5e8c", "#8895a1", "#b0b8c0"];

  return (
    <div>
      <div className="kpi-row">
        <Kpi label="Total Financial Impact" value={fmtUSD(kpis.total_impact)}
          foot={fmtUSDfull(kpis.total_impact)} />
        <Kpi label="Claims" value={fmtNum(kpis.claim_count)} foot="CIM/TCIM rework" />
        <Kpi label="% Controllable" value={fmtPct(kpis.pct_controllable, 0)}
          foot="of financial impact" />
        <Kpi label="Open + In-Progress" value={fmtNum(kpis.open_in_progress_tickets)}
          foot={`of ${fmtNum(kpis.total_tickets)} tickets`} />
        <Kpi label="AI Root-Cause Accuracy" value={fmtPct(kpis.ai_root_cause_accuracy)}
          foot={`n=${fmtNum(kpis.ai_eval_n)} tickets`} />
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Financial Impact by Root Cause</h3>
          <div className="card-sub">Colored by controllability</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trends.by_cause} layout="vertical"
              margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={fmtUSD} fontSize={11} />
              <YAxis type="category" dataKey="root_cause" width={165} fontSize={10.5} />
              <Tooltip formatter={(v) => fmtUSDfull(v)} />
              <Bar dataKey="total_impact" name="Impact">
                {trends.by_cause.map((d, i) => (
                  <Cell key={i} fill={CTRL_COLOR[d.controllability] || "#8895a1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 11, color: "#66707a", marginTop: 6 }}>
            <span style={{ color: CTRL_COLOR.Controllable }}>&#9632;</span> Controllable&nbsp;&nbsp;
            <span style={{ color: CTRL_COLOR["Non-Controllable"] }}>&#9632;</span> Non-Controllable
          </div>
        </div>

        <div className="card">
          <h3>Rework Financial Impact by Month</h3>
          <div className="card-sub">Sum of total_impact across segments</div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trends.by_month} margin={{ left: 10, right: 20 }}>
              <defs>
                <linearGradient id="imp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1b5e8c" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#1b5e8c" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="rework_month" fontSize={10.5} minTickGap={20} />
              <YAxis tickFormatter={fmtUSD} fontSize={11} />
              <Tooltip formatter={(v) => fmtUSDfull(v)} />
              <Area type="monotone" dataKey="total_impact" name="Impact"
                stroke="#1b5e8c" fill="url(#imp)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Top 10 Providers by Impact</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={providers} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={fmtUSD} fontSize={11} />
              <YAxis type="category" dataKey="rendering_name" width={150} fontSize={10} />
              <Tooltip formatter={(v) => fmtUSDfull(v)} />
              <Bar dataKey="total_impact" name="Impact" fill="#ff5f46" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>Ticket Status Breakdown by Priority</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={statusData} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ticket_status" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend fontSize={11} />
              {prioList.map((p, i) => (
                <Bar key={p} dataKey={p} stackId="a" name={p}
                  fill={prioColors[i % prioColors.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3>Top Rework Tickets by Financial Impact</h3>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>RITM</th><th>Claim</th><th>Status</th><th>Priority</th>
                <th>Team</th><th className="num">Impact</th>
                <th>Opened</th><th>Controllable</th>
              </tr>
            </thead>
            <tbody>
              {(tickets?.recent || []).map((t) => (
                <tr key={t.ritm_id}>
                  <td>{t.ritm_id}</td>
                  <td>{t.claim_id}</td>
                  <td><Pill kind={t.ticket_status === "Closed" ? "gray" : "amber"}>{t.ticket_status}</Pill></td>
                  <td>{t.priority}</td>
                  <td>{t.assigned_team}</td>
                  <td className="num">{fmtUSDfull(t.financial_impact)}</td>
                  <td>{t.opened_date}</td>
                  <td>{t.seeded_controllable ? <Pill kind="red">Yes</Pill> : <Pill kind="gray">No</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AIPanel
        title="AI Summary"
        subtitle="Rework & root-cause insights over the current aggregates"
        endpoint="/insights/rework"
      />
    </div>
  );
}
