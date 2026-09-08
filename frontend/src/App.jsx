import React, { useState } from "react";
import AgingTab from "./AgingTab.jsx";
import DenialsTab from "./DenialsTab.jsx";
import ReworkTab from "./ReworkTab.jsx";
import MonitoringTab from "./MonitoringTab.jsx";

const TABS = [
  { id: "aging", label: "Claims Aging", el: AgingTab },
  { id: "denials", label: "Denial Trends & Auto-Adjudication", el: DenialsTab },
  { id: "rework", label: "Rework & Root-Cause", el: ReworkTab },
  { id: "monitoring", label: "Config-Change Monitoring", el: MonitoringTab },
];

export default function App() {
  const [tab, setTab] = useState("aging");
  const Active = (TABS.find((t) => t.id === tab) || TABS[0]).el;
  return (
    <div>
      <header className="app-header">
        <h1>Claims Analytics</h1>
        <span className="sub">Payer Claims Operations &middot; Aging, Tracking &amp; Action Items</span>
        <span className="badge">Demo dataset</span>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="container">
        <Active />
      </div>
    </div>
  );
}
