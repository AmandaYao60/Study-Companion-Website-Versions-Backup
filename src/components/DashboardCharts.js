"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMonitoring, useSession } from "../context/AppContext";
import {
  selectDashboardMetricCards,
  selectDashboardSessionSource,
  selectLongTermSessionPatterns,
  selectSessionHistoryRows,
  selectSessionScopedMetricSamples,
} from "../services/session/index.js";
import BehavioralEngagementChart from "./dashboard/BehavioralEngagementChart";
import DashboardMetricCards from "./dashboard/DashboardMetricCards";
import EmotionalEngagementChart from "./dashboard/EmotionalEngagementChart";
import LearnerObservedSignalsPanel from "./dashboard/LearnerObservedSignalsPanel";
import LongTermPatternsPanel from "./dashboard/LongTermPatternsPanel";
import MetricStreamTable from "./dashboard/MetricStreamTable";
import SessionHistoryList from "./dashboard/SessionHistoryList";
import SessionHistoryModal from "./dashboard/SessionHistoryModal";
import SessionSelfReportPanel from "./dashboard/SessionSelfReportPanel";
import SessionSummaryPanel from "./dashboard/SessionSummaryPanel";

export default function DashboardCharts() {
  const {
    activeSession,
    activeSessionSamples,
    completedSessions,
    getSessionById,
    getMetricSamples,
  } = useSession();
  const {
    attention,
    fatigue,
    affectState,
  } = useMonitoring();

  const [completedSourceSession, setCompletedSourceSession] = useState(null);
  const [completedSourceSamples, setCompletedSourceSamples] = useState([]);
  const [historyModalSessionId, setHistoryModalSessionId] = useState(null);
  const [historyModalSession, setHistoryModalSession] = useState(null);
  const [historyModalSamples, setHistoryModalSamples] = useState([]);
  const [isHistoryModalLoading, setIsHistoryModalLoading] = useState(false);

  const source = useMemo(() => (
    selectDashboardSessionSource({ activeSession, completedSessions })
  ), [activeSession, completedSessions]);

  const historyRows = useMemo(() => (
    selectSessionHistoryRows(completedSessions)
  ), [completedSessions]);
  const longTermPatterns = useMemo(() => (
    selectLongTermSessionPatterns(completedSessions)
  ), [completedSessions]);

  const latestCompletedSessionId = source.kind === "latest-completed" ? source.session?.id || null : null;

  useEffect(() => {
    if (!latestCompletedSessionId) return undefined;

    let cancelled = false;
    Promise.all([
      getSessionById(latestCompletedSessionId),
      getMetricSamples(latestCompletedSessionId),
    ])
      .then(([session, samples]) => {
        if (cancelled) return;
        setCompletedSourceSession(session);
        setCompletedSourceSamples(samples);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load dashboard session source:", error);
        setCompletedSourceSession(null);
        setCompletedSourceSamples([]);
      });

    return () => {
      cancelled = true;
    };
  }, [latestCompletedSessionId, getSessionById, getMetricSamples]);

  useEffect(() => {
    if (!historyModalSessionId) return undefined;

    let cancelled = false;
    Promise.all([
      getSessionById(historyModalSessionId),
      getMetricSamples(historyModalSessionId),
    ])
      .then(([session, samples]) => {
        if (cancelled) return;
        setHistoryModalSession(session);
        setHistoryModalSamples(samples);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load historical session:", error);
        setHistoryModalSession(null);
        setHistoryModalSamples([]);
      })
      .finally(() => {
        if (!cancelled) setIsHistoryModalLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [historyModalSessionId, getSessionById, getMetricSamples]);

  const closeHistoryModal = useCallback(() => {
    setHistoryModalSessionId(null);
    setHistoryModalSession(null);
    setHistoryModalSamples([]);
    setIsHistoryModalLoading(false);
  }, []);

  const openHistoryModal = useCallback((sessionId) => {
    setHistoryModalSessionId(sessionId);
    setHistoryModalSession(null);
    setHistoryModalSamples([]);
    setIsHistoryModalLoading(true);
  }, []);

  const isCurrentSessionSource = source.kind === "active" || source.kind === "paused";
  const completedSourceMatchesLatest = completedSourceSession?.id === latestCompletedSessionId;
  const sessionForPanels = isCurrentSessionSource
    ? activeSession
    : completedSourceMatchesLatest
      ? completedSourceSession
      : source.session;
  const sourceSamples = isCurrentSessionSource
    ? activeSessionSamples
    : completedSourceMatchesLatest
      ? selectSessionScopedMetricSamples(completedSourceSamples, latestCompletedSessionId)
      : [];
  const currentMetrics = source.kind === "active"
    ? {
      attention,
      fatigue,
      valence: affectState.valid ? affectState.valence : null,
      arousal: affectState.valid ? affectState.arousal : null,
    }
    : null;
  const chartMode = source.kind === "active" ? "live" : "historical";
  const emotionalViewState = source.kind === "active"
    ? "active"
    : source.kind === "paused"
      ? "paused"
      : "end";

  const metricCards = selectDashboardMetricCards({
    session: sessionForPanels,
    samples: sourceSamples,
    currentMetrics,
    isActive: source.kind === "active",
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
            <BehavioralEngagementChart samples={sourceSamples} mode={chartMode} />
            <EmotionalEngagementChart
              samples={sourceSamples}
              mode={chartMode}
              viewState={emotionalViewState}
              allowExpandedAnalysis
            />
          </div>

          <MetricStreamTable rows={sourceSamples} mode={chartMode} />

          <SessionSummaryPanel session={sessionForPanels} sourceLabel={source.label} />

          <LearnerObservedSignalsPanel session={sessionForPanels} />

          <SessionSelfReportPanel session={sessionForPanels} />
        </>
      )}

      <LongTermPatternsPanel model={longTermPatterns} />

      <SessionHistoryList rows={historyRows} onSelectSession={openHistoryModal} />

      <SessionHistoryModal
        session={historyModalSession}
        samples={historyModalSamples}
        isLoading={isHistoryModalLoading}
        onClose={closeHistoryModal}
      />
    </div>
  );
}
