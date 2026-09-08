import React, { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, Cell,
} from "recharts";
import { getJSON, fmtNum, fmtPct } from "./api";
import { Kpi, AIPanel } from "./components.jsx";

const ADJ_COLOR = { PASS: "#2e844a", FAIL: "#c0392b", OVERRIDE: "#c47f17" };

export default function DenialsTab() {
  const [kpis, setKpis] = useState(null);
  const [charts, setCharts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getJSON("/denials/kpis"), getJSON("/denials/charts")])
      .then(([k, c]) => { setKpis(k); setCharts(c); })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">Failed to load: {error}</div>;
  if (!kpis) return <div className="loading">Loading denial trends...</div>;

  return (
    <div>
      <div className="kpi-row">
        <Kpi label="Denial Rate" value={fmtPct(kpis.denial_rate)} foot={`${fmtNum(kpis.postprod_claims)} post-prod claims`} />
        <Kpi label="Zero-Pay Rate" value={fmtPct(kpis.zero_pay_rate)} foot="paid amount = 0" />
        <Kpi label="Auto-Adjudication" value={fmtPct(kpis.auto_adjudication_rate)} foot="PASS / (PASS+FAIL+OVERRIDE)" />
        <Kpi label="Edit-Fire Rate" value={fmtPct(kpis.edit_fire_rate)} foot="claims with an edit fired" />
        <Kpi label="Manual Touch" value={fmtPct(100 - (kpis.auto_adjudication_rate || 0))} foot="FAIL + OVERRIDE share" />
      </div>

      <div className="card" style={{ background: "#fff8ee", borderColor: "#f0dcb8" }}>
        <div style={{ fontSize: 13, color: "#7a5a12" }}>
          <strong>Why this matters:</strong> Denials and manual edits are the leading
          drivers of downstream rework. Reducing FAIL/OVERRIDE edits and high-volume
          denial reasons here directly lowers the rework impact seen in the
          "Rework &amp; Root-Cause" tab.
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Denial &amp; Zero-Pay Rate Over Time</h3>
          <div className="card-sub">postprod_claims by processed month</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={charts.denial_trend} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={10.5} minTickGap={16} />
              <YAxis tickFormatter={(v) => `${v}%`} fontSize={11} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend fontSize={11} />
              <Line type="monotone" dataKey="denial_rate" name="Denial %" stroke="#c0392b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="zero_pay_rate" name="Zero-Pay %" stroke="#c47f17" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>Auto-Adjudication Breakdown</h3>
          <div className="card-sub">Edit status on audited claims</div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={charts.auto_adj} dataKey="cnt" nameKey="edit_status"
                cx="50%" cy="50%" outerRadius={95} label={(e) => `${e.edit_status}: ${fmtNum(e.cnt)}`}>
                {charts.auto_adj.map((d, i) => (
                  <Cell key={i} fill={ADJ_COLOR[d.edit_status] || "#8895a1"} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => fmtNum(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Top Denial Reasons</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={charts.top_reasons} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={fmtNum} fontSize={11} />
              <YAxis type="category" dataKey="reason" width={220} fontSize={9.5} />
              <Tooltip formatter={(v) => fmtNum(v)} />
              <Bar dataKey="cnt" name="Claims" fill="#c0392b" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>Denial Rate by State / Line of Business</h3>
          <div className="card-sub">Segments with &gt;100 claims, top by denial rate</div>
          <div style={{ overflowX: "auto", maxHeight: 300, overflowY: "auto" }}>
            <table>
              <thead>
                <tr><th>State</th><th>LOB</th><th className="num">Denial Rate</th><th className="num">Claims</th></tr>
              </thead>
              <tbody>
                {charts.by_state_lob.map((r, i) => (
                  <tr key={i}>
                    <td>{r.source_state}</td>
                    <td>{r.line_of_business}</td>
                    <td className="num" style={{ color: r.denial_rate >= 25 ? "#c0392b" : undefined }}>
                      {fmtPct(r.denial_rate)}
                    </td>
                    <td className="num">{fmtNum(r.claims)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AIPanel
        title="AI Summary"
        subtitle="Denial trends & auto-adjudication insights over the current aggregates"
        endpoint="/insights/denials"
      />
    </div>
  );
}
