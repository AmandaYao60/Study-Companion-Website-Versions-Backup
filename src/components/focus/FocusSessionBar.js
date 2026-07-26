"use client";

import React, { useState } from "react";
import { useMonitoring, useSession } from "../../context/AppContext";
import useSmoothSessionTimer from "../../hooks/useSmoothSessionTimer";
import { formatTargetDuration, formatTask } from "../dashboard/dashboardFormatters";
import SuggestedBreakButton from "../session/SuggestedBreakButton";

export default function FocusSessionBar({
  isFullscreen,
  isFullscreenSupported,
  isMonitorHidden,
  onShowMonitor,
  onToggleFullscreen,
}) {
  const {
    activeSession,
    automaticBreakSuggestion,
    automaticBreakSuggestionActions,
    pauseSession,
    resumeSession,
    sessionAudio,
    timedBreak,
    timedBreakActions,
  } = useSession();
  const { isMonitoring } = useMonitoring();
  const { formatted } = useSmoothSessionTimer(250);
  const [isToggling, setIsToggling] = useState(false);

  if (!activeSession) return null;

  const statusLabel = timedBreak.isBreakMode ? "Relaxing" : isMonitoring ? "Active" : "Paused";
  const showManualStartBreak = automaticBreakSuggestion?.showManualStartBreak === true;
  const handleSessionToggle = async () => {
    setIsToggling(true);
    try {
      if (timedBreak.isBreakMode) {
        timedBreakActions.requestEndBreakEarly();
      } else if (isMonitoring) {
        await pauseSession();
      } else {
        await resumeSession();
      }
    } finally {
      setIsToggling(false);
    }
  };

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
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950 px-2 py-1.5">
            <button
              type="button"
              onClick={() => sessionAudio.setMuted(!sessionAudio.muted)}
              aria-label={sessionAudio.muted ? "Unmute session audio" : "Mute session audio"}
              className="rounded-lg px-2 py-1 text-xs font-black text-cyan-100 transition-all hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            >
              {sessionAudio.muted ? "Muted" : "Audio"}
            </button>
            <label className="sr-only" htmlFor="focus-session-volume">Session audio volume</label>
            <input
              id="focus-session-volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={sessionAudio.volume}
              onChange={(event) => sessionAudio.setVolume(Number(event.target.value))}
              className="h-1 w-20 accent-cyan-300"
            />
            {sessionAudio.blocked && (
              <button type="button" onClick={sessionAudio.enableAudio} className="rounded-lg bg-cyan-400 px-2 py-1 text-[10px] font-bold text-slate-950">
                Enable
              </button>
            )}
          </div>
          {isFullscreen ? (
            <>
              {showManualStartBreak && (
                <SuggestedBreakButton
                  onClick={automaticBreakSuggestionActions.openDurationChooser}
                />
              )}
              <button type="button" onClick={onToggleFullscreen} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-white/15">
                Exit Fullscreen
              </button>
            </>
          ) : (
            <>
              {isMonitorHidden && (
                <button type="button" onClick={onShowMonitor} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-800">
                  Show Monitor
                </button>
              )}
              {showManualStartBreak && (
                <SuggestedBreakButton
                  onClick={automaticBreakSuggestionActions.openDurationChooser}
                />
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
