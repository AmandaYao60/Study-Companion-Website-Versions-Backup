"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppState } from "../../context/AppContext";
import useSmoothSessionTimer from "../../hooks/useSmoothSessionTimer";
import { formatTargetDuration, formatTask } from "../dashboard/dashboardFormatters";
import EndSessionDialog from "./EndSessionDialog";

export default function ActiveSessionCard() {
  const router = useRouter();
  const { activeSession, isMonitoring, resumeSession, finishSession, setShowCameraDialog } = useAppState();
  const { formatted } = useSmoothSessionTimer(250);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  if (!activeSession) return null;

  const isPrepared = activeSession.status === "prepared";

  const handleResume = async () => {
    router.push("/app/study");

    if (isPrepared) {
      window.setTimeout(() => setShowCameraDialog(true), 0);
      return;
    }

    if (!isMonitoring) {
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

  return (
    <>
      <section className="rounded-3xl border border-white/10 bg-slate-950/50 p-6 shadow-2xl backdrop-blur-xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Welcome back</p>
        <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">Your study session is still active.</h1>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4 sm:col-span-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Study task</p>
            <p className="mt-2 text-sm font-bold text-white">{formatTask(activeSession.taskDescription)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Elapsed</p>
            <p className="mt-2 font-mono text-lg font-bold text-cyan-200">{formatted}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</p>
            <p className="mt-2 text-sm font-bold text-white">{isPrepared ? "Ready to begin" : isMonitoring ? "Active" : "Paused"}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-400">Target: {formatTargetDuration(activeSession.targetDurationMs)}</p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => void handleResume()} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition-all hover:bg-cyan-300">
            {isPrepared ? "Begin Study" : "Resume Study"}
          </button>
          <Link href="/app/dashboard" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800">
            View Dashboard
          </Link>
          <button type="button" onClick={() => setIsDialogOpen(true)} className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition-all hover:bg-emerald-400/20">
            End Session
          </button>
        </div>
      </section>
      <EndSessionDialog open={isDialogOpen} isEnding={isEnding} onClose={() => setIsDialogOpen(false)} onConfirm={() => void handleEnd()} />
    </>
  );
}
