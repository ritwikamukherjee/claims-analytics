import React, { useState } from "react";
import Markdown from "react-markdown";
import { getJSON } from "./api";

export function Kpi({ label, value, foot }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}

export function Pill({ kind, children }) {
  return <span className={`pill ${kind || "gray"}`}>{children}</span>;
}

export function severityPill(sev) {
  const k = sev === "High" ? "red" : sev === "Medium" ? "amber" : "green";
  return <Pill kind={k}>{sev}</Pill>;
}

// AI panel with a Generate button. `endpoint` is the /api path to call.
export function AIPanel({ title, subtitle, endpoint, buttonLabel = "Generate summary" }) {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const data = await getJSON(endpoint);
      setContent(data.summary);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div>
          <h3 style={{ marginBottom: 2 }}>{title}</h3>
          {subtitle && <div className="card-sub" style={{ margin: 0 }}>{subtitle}</div>}
        </div>
        <button className="gen" style={{ marginLeft: "auto" }} onClick={generate} disabled={loading}>
          {loading && <span className="spinner" />}
          {loading ? "Generating..." : content ? "Regenerate" : buttonLabel}
        </button>
      </div>
      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="ai-panel">
        {content ? (
          <Markdown>{content}</Markdown>
        ) : (
          !error && (
            <div className="ai-empty">
              Click "{buttonLabel}" to generate an AI analysis grounded in the current
              aggregates (Claude Sonnet 4.6 via Databricks Foundation Model API).
            </div>
          )
        )}
      </div>
    </div>
  );
}
