"use client";

import React, { useEffect, useRef } from "react";
import { selectSessionSummarySections } from "../../services/session/index.js";
import BehavioralEngagementChart from "./BehavioralEngagementChart";
import EmotionalEngagementChart from "./EmotionalEngagementChart";
import MetricStreamTable from "./MetricStreamTable";
import SessionSelfReportPanel from "./SessionSelfReportPanel";
import { formatCoverage, formatDateTime, formatMetricValue, formatTask } from "./dashboardFormatters";

const averageFromStats = (session, key) => session?.statistics?.[key]?.mean ?? null;

export default function SessionHistoryModal({ session, samples = [], isLoading, onClose }) {
  const closeButtonRef = useRef(null);
  const summarySections = selectSessionSummarySections(session);

  useEffect(() => {
    if (!session && !isLoading) return undefined;

    const previousActiveElement = document.activeElement;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus?.();
    };
  }, [session, isLoading, onClose]);

  if (!session && !isLoading) return null;

  const detailRows = session ? [
    ["Date and time", formatDateTime(session.endedAt || session.startedAt)],
    ["Data coverage", formatCoverage(session.dataCoverage)],
    ["Attention average", `${formatMetricValue(averageFromStats(session, "attention"), "percentage")}${Number.isFinite(averageFromStats(session, "attention")) ? "%" : ""}`],
    ["Fatigue average", `${formatMetricValue(averageFromStats(session, "fatigue"), "percentage")}${Number.isFinite(averageFromStats(session, "fatigue")) ? "%" : ""}`],
    ["Valence average", formatMetricValue(averageFromStats(session, "valence"), "affect")],
    ["Arousal average", formatMetricValue(averageFromStats(session, "arousal"), "affect")],
    ["Sample count", String(session.sampleCount ?? samples.length)],
  ] : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-history-modal-title"
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-5 text-white shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300">Completed Session</p>
            <h2 id="session-history-modal-title" className="mt-2 text-xl font-black tracking-tight">
              {session ? formatTask(session.taskDescription) : "Loading session"}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          >
            Close
          </button>
        </div>

        {isLoading || !session ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/40 p-8 text-center text-sm text-slate-400">Loading session history...</div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {detailRows.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-slate-900/45 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
                </div>
              ))}
            </div>

            <SessionSelfReportPanel session={session} variant="modal" />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <BehavioralEngagementChart samples={samples} mode="historical" />
              <EmotionalEngagementChart samples={samples} mode="historical" />
            </div>

            <MetricStreamTable
              rows={samples}
              mode="historical"
              title="Session Metric Samples"
              subtitle="Five-second aggregated samples recorded during this study session."
              expandable
              showStatusBadge={false}
            />

            <div className="rounded-xl border border-white/10 bg-slate-900/35 p-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">Structured Session Summary</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-5">
                {summarySections.map(({ key, fallbackTitle, section }) => (
                  <article key={key} className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{fallbackTitle}</p>
                    <p className="mt-2 text-sm font-semibold text-white">{section.title}</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">{section.message}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-900/35 p-4 text-xs text-slate-400">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">Version Information</h3>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <span>Schema: {session.schemaVersion}</span>
                <span>Pipeline: {session.pipelineVersion}</span>
                <span>Aggregation: {session.aggregationVersion}</span>
                <span>Summary: {session.summaryAlgorithmVersion}</span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
