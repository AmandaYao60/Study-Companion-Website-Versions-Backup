"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAppState } from "../context/AppContext";
import {
  selectDashboardMetricCards,
  selectDashboardSessionSource,
  selectSessionHistoryRows,
} from "../services/session/index.js";
import BehavioralEngagementChart from "./dashboard/BehavioralEngagementChart";
import DashboardMetricCards from "./dashboard/DashboardMetricCards";
import EmotionalEngagementChart from "./dashboard/EmotionalEngagementChart";
import LongTermTrendsPlaceholder from "./dashboard/LongTermTrendsPlaceholder";
import MetricStreamTable from "./dashboard/MetricStreamTable";
import SessionHistoryList from "./dashboard/SessionHistoryList";
import SessionSelfReportPanel from "./dashboard/SessionSelfReportPanel";
import SessionSummaryPanel from "./dashboard/SessionSummaryPanel";

export default function DashboardCharts() {
  const {
    activeSession,
    completedSessions,
    getSessionById,
    getMetricSamples,
  } = useAppState();

  const [requestedSessionId, setRequestedSessionId] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedSamples, setSelectedSamples] = useState([]);

  const source = useMemo(() => (
    selectDashboardSessionSource({ activeSession, completedSessions })
  ), [activeSession, completedSessions]);

  const historyRows = useMemo(() => (
    selectSessionHistoryRows(completedSessions)
  ), [completedSessions]);

  const latestSessionId = source.session?.id || null;
  const selectedSessionId = completedSessions.some((session) => session.id === requestedSessionId)
    ? requestedSessionId
    : latestSessionId;

  useEffect(() => {
    if (!selectedSessionId) return undefined;

    let cancelled = false;
    Promise.all([
      getSessionById(selectedSessionId),
      getMetricSamples(selectedSessionId),
    ])
      .then(([session, samples]) => {
        if (cancelled) return;
        setSelectedSession(session);
        setSelectedSamples(samples);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSessionId, getSessionById, getMetricSamples]);

  const sessionForPanels = selectedSession?.id === selectedSessionId
    ? selectedSession
    : completedSessions.find((session) => session.id === selectedSessionId) || null;
  const sourceSamples = selectedSession?.id === selectedSessionId ? selectedSamples : [];

  const metricCards = selectDashboardMetricCards({
    session: sessionForPanels,
    samples: sourceSamples,
    isActive: false,
  });

  return (
    <div className="space-y-6">
      {source.kind === "empty" && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-center shadow-2xl backdrop-blur-xl">
          <h2 className="text-xl font-black text-white">No completed study sessions yet.</h2>
          <p className="mt-2 text-sm text-slate-400">Complete your first study session to begin building your learning history.</p>
          <Link href="/app" className="mt-5 inline-flex rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition-all hover:bg-cyan-300">
            Start a Study Session
          </Link>
        </div>
      )}

      {sessionForPanels && (
        <>
          <DashboardMetricCards cards={metricCards} />

          <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
            <BehavioralEngagementChart samples={sourceSamples} mode="historical" />
            <EmotionalEngagementChart
              samples={sourceSamples}
              mode="historical"
              viewState="end"
              allowExpandedAnalysis
            />
          </div>

          <MetricStreamTable rows={sourceSamples} mode="historical" />

          <SessionSummaryPanel session={sessionForPanels} sourceLabel={source.label} />

          <SessionSelfReportPanel session={sessionForPanels} />
        </>
      )}

      <SessionHistoryList rows={historyRows} selectedSessionId={selectedSessionId} onSelectSession={setRequestedSessionId} />

      <LongTermTrendsPlaceholder />
    </div>
  );
}
