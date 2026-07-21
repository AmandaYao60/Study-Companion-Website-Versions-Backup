"use client";

import React, { useMemo } from "react";
import { useAppState } from "../../context/AppContext";
import DashboardCharts from "../DashboardCharts";
import { selectDashboardSessionSource } from "../../services/session/index.js";

export default function ProductDashboard() {
  const { activeSession, completedSessions, resetMetrics } = useAppState();
  const source = useMemo(() => selectDashboardSessionSource({ activeSession, completedSessions }), [activeSession, completedSessions]);
  const badgeLabel = source.kind === "active" ? "Live Session" : source.kind === "completed" ? "Session Complete" : "No Session Data";

  const handleClear = async () => {
    if (!window.confirm("Clear all in-memory session data? This cannot be undone.")) return;
    await resetMetrics();
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Analytics Dashboard</h1>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">{badgeLabel}</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {source.kind === "active" ? "This session is still in progress. Opening Dashboard does not pause monitoring." : "Review completed study sessions using local in-memory history."}
          </p>
        </div>

        <button type="button" onClick={() => void handleClear()} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 transition-all hover:bg-slate-800 hover:text-white">
          Clear Local Data
        </button>
      </div>

      <DashboardCharts />
    </div>
  );
}
