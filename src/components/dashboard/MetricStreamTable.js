"use client";

import React, { useMemo, useState } from "react";
import { formatDuration, formatMetricValue } from "./dashboardFormatters";
import { getMetricPresentation, UNAVAILABLE_VALUE } from "./metricPresentation";

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const ROW_HEIGHT_PX = 44;
const HEADER_HEIGHT_PX = 44;

const formatCellMetric = (value, valueKind = "percentage") => {
  if (!isFiniteNumber(value)) return UNAVAILABLE_VALUE;
  const display = formatMetricValue(value, valueKind);
  return valueKind === "affect" ? display : `${display}%`;
};

const formatDataQuality = (value) => {
  if (!value) return UNAVAILABLE_VALUE;
  return String(value).replace(/[-_]/g, " ");
};

const normalizeRows = (rows = []) => rows
  .map((row, index) => ({
    id: row.id || `${row.recordedAt || row.elapsedMs || "row"}-${index}`,
    elapsedMs: row.elapsedMs,
    attention: row.attention,
    fatigue: row.fatigue,
    valence: row.valence,
    arousal: row.arousal,
    emotion: row.emotion ?? null,
    emotionConfidence: row.emotionConfidence,
    dataQuality: row.dataQuality ?? null,
  }))
  .sort((a, b) => (b.elapsedMs || 0) - (a.elapsedMs || 0));

function MetricValueCell({ value, valueKind = "percentage", metricKey }) {
  const hasValue = isFiniteNumber(value);
  const colorClass = hasValue ? getMetricPresentation(metricKey).tableValue : "text-slate-500";

  return (
    <td className={`px-4 py-3 text-center font-mono tabular-nums ${colorClass}`}>
      {formatCellMetric(value, valueKind)}
    </td>
  );
}

export default function MetricStreamTable({
  rows = [],
  mode = "live",
  title: titleOverride,
  subtitle: subtitleOverride,
  visibleRowCount = 5,
  expandable = false,
  showStatusBadge = true,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const tableRows = useMemo(() => normalizeRows(rows), [rows]);
  const isLive = mode === "live";
  const title = titleOverride || (isLive ? "Live Metric Stream" : "Session Metric Samples");
  const subtitle = subtitleOverride || (isLive
    ? "One-second live display rows for the active session."
    : "Persisted five-second samples for the selected completed session.");
  const effectiveRowCount = expandable && isExpanded ? 20 : visibleRowCount;
  const tableMaxHeight = HEADER_HEIGHT_PX + Math.max(1, effectiveRowCount) * ROW_HEIGHT_PX;

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {expandable && tableRows.length > 0 && (
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => setIsExpanded((value) => !value)}
              className="rounded-full border border-white/10 bg-slate-900 px-3 py-1 text-[10px] font-semibold text-slate-200 transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            >
              {isExpanded ? "Show 5 rows" : "Show 20 rows"}
            </button>
          )}
          {showStatusBadge && (
            <span className="w-fit rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">
              {isLive ? "Live · Updated just now" : "Historical"}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-white/10 bg-slate-950/60">
        {tableRows.length === 0 ? (
          <div className="flex min-h-36 items-center justify-center p-6 text-center text-sm text-slate-400">
            {isLive ? "Waiting for the first live metric sample…" : "No session metric samples are available yet."}
          </div>
        ) : (
          <div className="overflow-y-auto" style={{ maxHeight: `${tableMaxHeight}px` }}>
            <table className="min-w-[820px] w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-950/95 text-xs uppercase tracking-[0.08em] text-slate-500 backdrop-blur">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-center font-bold">Time</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center font-bold">Attention</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center font-bold">Fatigue</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center font-bold">Valence</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center font-bold">Arousal</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center font-bold">Emotion</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center font-bold">Data Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {tableRows.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3 text-center font-mono font-bold tabular-nums text-white">{formatDuration(row.elapsedMs)}</td>
                    <MetricValueCell value={row.attention} metricKey="attention" />
                    <MetricValueCell value={row.fatigue} metricKey="fatigue" />
                    <MetricValueCell value={row.valence} valueKind="affect" metricKey="valence" />
                    <MetricValueCell value={row.arousal} valueKind="affect" metricKey="arousal" />
                    <td className="px-4 py-3 text-center text-slate-300">
                      <span title={isFiniteNumber(row.emotionConfidence) ? `Confidence ${row.emotionConfidence.toFixed(2)}` : undefined}>
                        {row.emotion || UNAVAILABLE_VALUE}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center capitalize text-slate-400">{formatDataQuality(row.dataQuality)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
