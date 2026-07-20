"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import SessionHistoryList from "./dashboard/SessionHistoryList";
import SessionHistoryModal from "./dashboard/SessionHistoryModal";
import SessionSummaryPanel from "./dashboard/SessionSummaryPanel";

export default function DashboardCharts() {
  const {
    activeSession,
    completedSessions,
    activeSessionSamples,
    focus,
    fatigue,
    affectState,
    getSessionById,
    getMetricSamples,
  } = useAppState();

  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [completedSourceSamples, setCompletedSourceSamples] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedSamples, setSelectedSamples] = useState([]);

  const source = useMemo(() => (
    selectDashboardSessionSource({ activeSession, completedSessions })
  ), [activeSession, completedSessions]);

  const historyRows = useMemo(() => (
    selectSessionHistoryRows(completedSessions)
  ), [completedSessions]);

  const sourceSamples = source.kind === "active" ? activeSessionSamples : completedSourceSamples;
  const sourceSession = source.session;
  const sessionForPanels = sourceSession || null;

  const currentMetrics = source.kind === "active"
    ? {
        attention: focus,
        fatigue,
        valence: affectState.valid ? affectState.valence : null,
        arousal: affectState.valid ? affectState.arousal : null,
      }
    : null;

  const metricCards = selectDashboardMetricCards({
    session: sessionForPanels,
    samples: sourceSamples,
    currentMetrics,
    isActive: source.kind === "active",
  });

  useEffect(() => {
    if (source.kind !== "completed" || !source.session?.id) {
      return undefined;
    }

    let cancelled = false;
    getMetricSamples(source.session.id).then((samples) => {
      if (!cancelled) setCompletedSourceSamples(samples);
    });

    return () => {
      cancelled = true;
    };
  }, [source.kind, source.session?.id, getMetricSamples]);
  useEffect(() => {
    if (!selectedSessionId) {
      return undefined;
    }

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

  const closeModal = () => setSelectedSessionId(null);
  const isModalLoading = Boolean(selectedSessionId && selectedSession?.id !== selectedSessionId);

  return (
    <div className="space-y-6">
      {source.kind === "empty" && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-sm text-slate-400 shadow-2xl backdrop-blur-xl">
          No session data is available yet. Start and finish a study session to populate the Dashboard.
        </div>
      )}

      <DashboardMetricCards cards={metricCards} sourceLabel={source.label} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BehavioralEngagementChart samples={sourceSamples} mode={source.kind === "active" ? "live" : "historical"} />
        <EmotionalEngagementChart samples={sourceSamples} mode={source.kind === "active" ? "live" : "historical"} />
      </div>

      <SessionSummaryPanel session={sessionForPanels} sourceLabel={source.label} />

      <SessionHistoryList rows={historyRows} onSelectSession={setSelectedSessionId} />

      <LongTermTrendsPlaceholder />

      {selectedSessionId && (
        <SessionHistoryModal
          session={selectedSession}
          samples={selectedSamples}
          isLoading={isModalLoading}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
