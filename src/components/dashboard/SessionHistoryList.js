"use client";

import React from "react";
import { formatDateTime, formatDuration, formatTargetDuration, formatTask } from "./dashboardFormatters";

export default function SessionHistoryList({ rows = [], onSelectSession }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-2xl backdrop-blur-xl">
      <div className="mb-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">Session History</h2>
        <p className="mt-1 text-xs text-slate-500">Completed sessions are listed newest first.</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/30 p-5 text-sm text-slate-400">
          No completed sessions yet. Finish a study session to see it here.
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto rounded-xl border border-white/10">
          <div className="grid grid-cols-3 gap-3 border-b border-white/10 bg-slate-900/70 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span>Date & Time</span>
            <span>Study Task</span>
            <span>Target / Actual Duration</span>
          </div>
          <div className="divide-y divide-white/10">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => onSelectSession(row.id)}
                className="grid w-full grid-cols-3 gap-3 px-4 py-3 text-left text-xs text-slate-300 transition-all hover:bg-cyan-400/[0.06] focus:bg-cyan-400/[0.08] focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
              >
                <span>{formatDateTime(row.dateTime)}</span>
                <span className="font-semibold text-slate-100">{formatTask(row.taskDescription)}</span>
                <span>{formatTargetDuration(row.targetDurationMs)} / {formatDuration(row.actualDurationMs)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
