"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "../../context/AppContext";
import useSmoothSessionTimer from "../../hooks/useSmoothSessionTimer";
import { formatTargetDuration, formatTask } from "../dashboard/dashboardFormatters";
import SessionProgress from "../session/SessionProgress";
import EndSessionDialog from "../product/EndSessionDialog";

export default function FocusSessionBar({
  isFullscreen,
  isFullscreenSupported,
  onToggleFullscreen,
}) {
  const router = useRouter();
  const {
    activeSession,
    isMonitoring,
    pauseSession,
    resumeSession,
    finishSession,
    discardSession,
  } = useAppState();
  const { elapsedMs, formatted } = useSmoothSessionTimer(250);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  if (!activeSession) return null;

  const isPrepared = activeSession.status === "prepared";
  const statusLabel = isPrepared ? "Ready to begin" : isMonitoring ? "Active" : "Paused";

  const handlePauseResume = async () => {
    if (isPrepared) return;
    setIsToggling(true);
    try {
      if (isMonitoring) {
        await pauseSession();
      } else {
        await resumeSession();
      }
    } finally {
      setIsToggling(false);
    }
  };

  const handleEnd = async () => {
    setIsEnding(true);
    try {
      const completed = await finishSession();
      setIsDialogOpen(false);
      router.push(completed ? "/app/dashboard" : "/app");
    } finally {
      setIsEnding(false);
    }
  };

  const handleDiscard = async () => {
    if (!window.confirm("Discard this active session? Collected samples for it will be deleted.")) return;
    setIsEnding(true);
    try {
      await discardSession();
      setIsDialogOpen(false);
      router.push("/app");
    } finally {
      setIsEnding(false);
    }
  };

  return (
    <>
      <aside className={`absolute left-3 right-3 top-3 z-40 rounded-2xl border border-white/10 px-3 py-2 shadow-2xl backdrop-blur-xl sm:left-5 sm:right-5 ${isFullscreen ? "bg-slate-950/35" : "bg-slate-950/82"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-300">Current Study Session</p>
              <span className="max-w-[18rem] truncate text-xs font-bold text-white sm:max-w-sm">{formatTask(activeSession.taskDescription)}</span>
              <span className="font-mono text-xs font-bold text-cyan-200">{formatted}</span>
              <span className="text-xs text-slate-400">{formatTargetDuration(activeSession.targetDurationMs)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isMonitoring ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{statusLabel}</span>
            </div>
            <SessionProgress elapsedMs={elapsedMs} targetDurationMs={activeSession.targetDurationMs} className="mt-2 max-w-xl" />
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {isFullscreen ? (
              <button type="button" onClick={onToggleFullscreen} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-white/15">
                Exit Fullscreen
              </button>
            ) : (
              <>
                {isFullscreenSupported && (
                  <button type="button" onClick={onToggleFullscreen} className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition-all hover:bg-cyan-400/20">
                    Fullscreen
                  </button>
                )}
                {!isPrepared && (
                  <button type="button" onClick={() => void handlePauseResume()} disabled={isToggling} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70">
                    {isMonitoring ? "Pause" : isToggling ? "Resuming..." : "Resume"}
                  </button>
                )}
                <button type="button" onClick={() => setIsDialogOpen(true)} className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition-all hover:bg-emerald-400/20">
                  End Session
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
      <EndSessionDialog open={isDialogOpen} isEnding={isEnding} onClose={() => setIsDialogOpen(false)} onConfirm={() => void handleEnd()} onDiscard={() => void handleDiscard()} />
    </>
  );
}
