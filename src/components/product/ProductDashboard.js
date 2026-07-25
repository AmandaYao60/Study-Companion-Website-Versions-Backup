"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useSession } from "../../context/AppContext";
import DashboardCharts from "../DashboardCharts";
import { selectDashboardSessionSource } from "../../services/session/index.js";

export default function ProductDashboard() {
  const { activeSession, completedSessions, resetMetrics } = useSession();
  const source = useMemo(() => selectDashboardSessionSource({ activeSession, completedSessions }), [activeSession, completedSessions]);
  const dashboardCopy = {
    active: "Viewing the live current study session. Charts use committed five-second samples.",
    paused: "Viewing the paused current study session. Data stays frozen until the session resumes.",
    "latest-completed": "Reviewing the latest completed study session stored locally in this browser.",
    empty: "Complete a study session to begin building local analytics history.",
  };

  const handleClear = async () => {
    if (!window.confirm("Clear all local session data? This cannot be undone.")) return;
    try {
      await resetMetrics();
    } catch (error) {
      console.error("Failed to clear local session data:", error);
      window.alert("Could not clear local session data. Please try again.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Analytics Dashboard</h1>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">{source.label}</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {dashboardCopy[source.kind] || dashboardCopy.empty}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app" className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-200 transition-all hover:bg-cyan-400/20">
            Return to Study Space
          </Link>
          <button type="button" onClick={() => void handleClear()} className="rounded-xl border border-white/10 bg-rose-900/20 px-4 py-2 text-xs font-semibold text-rose-300 transition-all hover:bg-rose-800 hover:text-white">
            Clear Local Data
          </button>
        </div>
      </div>

      <DashboardCharts />
    </div>
  );
}
