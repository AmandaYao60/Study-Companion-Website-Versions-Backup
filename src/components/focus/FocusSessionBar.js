"use client";

import React from "react";
import { useMonitoring, useSession } from "../../context/AppContext";
import useSmoothSessionTimer from "../../hooks/useSmoothSessionTimer";
import { formatTargetDuration, formatTask } from "../dashboard/dashboardFormatters";

export default function FocusSessionBar({
  isFullscreen,
  isFullscreenSupported,
  isMonitorHidden,
  onShowMonitor,
  onToggleFullscreen,
}) {
  const { activeSession } = useSession();
  const { isMonitoring } = useMonitoring();
  const { formatted } = useSmoothSessionTimer(250);

  if (!activeSession) return null;

  const statusLabel = isMonitoring ? "Active" : "Paused";

  return (
    <aside className={`absolute left-3 right-3 top-3 z-40 rounded-2xl border border-white/10 px-3 py-2 shadow-2xl backdrop-blur-xl sm:left-5 sm:right-5 ${isFullscreen ? "bg-slate-950/35" : "bg-slate-950/82"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-300">Current Study Session</p>
          <span className="max-w-[18rem] truncate text-xs font-bold text-white sm:max-w-sm">{formatTask(activeSession.taskDescription)}</span>
          <span className="font-mono text-xs font-bold text-cyan-200">{formatted}</span>
          <span className="text-xs text-slate-400">{formatTargetDuration(activeSession.targetDurationMs)}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isMonitoring ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{statusLabel}</span>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isFullscreen ? (
            <button type="button" onClick={onToggleFullscreen} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-white/15">
              Exit Fullscreen
            </button>
          ) : (
            <>
              {isMonitorHidden && (
                <button type="button" onClick={onShowMonitor} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-800">
                  Show Monitor
                </button>
              )}
              {isFullscreenSupported && (
                <button type="button" onClick={onToggleFullscreen} className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition-all hover:bg-cyan-400/20">
                  Fullscreen
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
