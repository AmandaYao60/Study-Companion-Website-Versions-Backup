"use client";

import React, { useMemo } from "react";
import { useAppState } from "../../context/AppContext";
import DashboardCharts from "../../components/DashboardCharts";
import { selectDashboardSessionSource } from "../../services/session/index.js";

export default function DashboardPage() {
  const {
    activeSession,
    completedSessions,
    resetMetrics,
  } = useAppState();

  const source = useMemo(() => (
    selectDashboardSessionSource({ activeSession, completedSessions })
  ), [activeSession, completedSessions]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Analytics Dashboard</h1>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
              {source.label}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Review active and completed study sessions using the session-domain history model.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void resetMetrics()}
          className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 transition-all hover:bg-slate-800 hover:text-white"
        >
          Clear Session Data
        </button>
      </div>

      <DashboardCharts />
    </div>
  );
}
