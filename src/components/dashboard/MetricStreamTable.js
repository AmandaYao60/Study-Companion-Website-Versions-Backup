"use client";

import React, { useMemo } from "react";
import { formatDuration, formatMetricValue } from "./dashboardFormatters";

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const formatCellMetric = (value, valueKind = "percentage") => {
  if (!isFiniteNumber(value)) return "—";
  const display = formatMetricValue(value, valueKind);
  return valueKind === "affect" ? display : `${display}%`;
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

export default function MetricStreamTable({ rows = [], mode = "live" }) {
  const tableRows = useMemo(() => normalizeRows(rows), [rows]);
  const isLive = mode === "live";
  const title = isLive ? "Live Metric Stream" : "Session Metric Samples";

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {isLive ? "One-second live display rows for the active session." : "Persisted five-second samples for the selected completed session."}
          </p>
        </div>
        <span className="w-fit rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">
          {isLive ? "Live · Updated just now" : "Historical"}
        </span>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-white/10 bg-slate-950/60">
        {tableRows.length === 0 ? (
          <div className="flex min-h-36 items-center justify-center p-6 text-center text-sm text-slate-400">
            {isLive ? "Waiting for the first live metric sample…" : "No session metric samples are available yet."}
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            <table className="min-w-[760px] w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-950/95 text-[10px] uppercase tracking-[0.18em] text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-4 py-3 font-bold">Time</th>
                  <th className="px-4 py-3 text-right font-bold">Attention</th>
                  <th className="px-4 py-3 text-right font-bold">Fatigue</th>
                  <th className="px-4 py-3 text-right font-bold">Valence</th>
                  <th className="px-4 py-3 text-right font-bold">Arousal</th>
                  <th className="px-4 py-3 font-bold">Emotion</th>
                  <th className="px-4 py-3 font-bold">Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {tableRows.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-mono text-cyan-200">{formatDuration(row.elapsedMs)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCellMetric(row.attention)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCellMetric(row.fatigue)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCellMetric(row.valence, "affect")}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCellMetric(row.arousal, "affect")}</td>
                    <td className="px-4 py-3">
                      <span title={isFiniteNumber(row.emotionConfidence) ? `Confidence ${row.emotionConfidence.toFixed(2)}` : undefined}>
                        {row.emotion || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-400">{row.dataQuality || "—"}</td>
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
