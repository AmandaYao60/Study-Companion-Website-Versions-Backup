"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAppState } from "../../context/AppContext";
import useSmoothSessionTimer from "../../hooks/useSmoothSessionTimer";
import { formatTargetDuration, formatTask } from "../dashboard/dashboardFormatters";
import EndSessionDialog from "./EndSessionDialog";

export default function GlobalSessionBar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    activeSession,
    isMonitoring,
    pauseSession,
    resumeSession,
    finishSession,
    discardSession,
    setShowCameraDialog,
  } = useAppState();
  const { formatted } = useSmoothSessionTimer(250);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  if (!activeSession) return null;

  const isFocusRoute = pathname.startsWith("/app/focus");
  const isPrepared = activeSession.status === "prepared";
  const statusLabel = isPrepared ? "Ready to begin" : isMonitoring ? "Active" : "Paused";
  const contextualHref = isFocusRoute ? "/app/study" : "/app/focus";
  const contextualLabel = isFocusRoute ? "Return to Study Space" : "Enter Focus Space";

  const handlePauseResume = async () => {
    if (isPrepared) {
      setShowCameraDialog(true);
      return;
    }

    if (isMonitoring) {
      await pauseSession();
    } else {
      await resumeSession();
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
      <aside className="sticky top-16 z-30 border-b border-white/10 bg-slate-900/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Current Study Session</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-300">
              <span className="max-w-xs truncate font-bold text-white">{formatTask(activeSession.taskDescription)}</span>
              <span className="font-mono text-cyan-200">{formatted}</span>
              <span>{formatTargetDuration(activeSession.targetDurationMs)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isMonitoring ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{statusLabel}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void handlePauseResume()} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-800">
              {isPrepared ? "Enable Camera" : isMonitoring ? "Pause" : "Resume"}
            </button>
            <Link href={contextualHref} aria-disabled={!isMonitoring && !isFocusRoute} className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${!isMonitoring && !isFocusRoute ? "pointer-events-none border border-white/10 bg-slate-900 text-slate-600" : "border border-cyan-400/20 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20"}`}>
              {contextualLabel}
            </Link>
            <button type="button" onClick={() => setIsDialogOpen(true)} className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition-all hover:bg-emerald-400/20">
              End Session
            </button>
          </div>
        </div>
      </aside>
      <EndSessionDialog open={isDialogOpen} isEnding={isEnding} onClose={() => setIsDialogOpen(false)} onConfirm={() => void handleEnd()} onDiscard={() => void handleDiscard()} />
    </>
  );
}
