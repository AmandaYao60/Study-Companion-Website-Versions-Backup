"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppState } from "../../context/AppContext";
import useSmoothSessionTimer from "../../hooks/useSmoothSessionTimer";
import { formatTargetDuration, formatTask } from "../dashboard/dashboardFormatters";

const formatCheckIn = (checkIn) => {
  if (!checkIn) return null;
  const details = [];
  if (checkIn.energy) details.push(`Energy: ${checkIn.energy}`);
  if (checkIn.mood) details.push(`Mood: ${checkIn.mood}`);
  return details.length > 0 ? details.join(" / ") : null;
};

export default function ActiveSessionCard() {
  const router = useRouter();
  const { activeSession, isMonitoring, isCameraAllowed, resumeSession, setShowCameraDialog } = useAppState();
  const { formatted } = useSmoothSessionTimer(250);
  const [isResuming, setIsResuming] = useState(false);

  if (!activeSession) return null;

  const isPrepared = activeSession.status === "prepared";
  const isPaused = activeSession.status === "paused" || !isMonitoring;
  const statusLabel = isPrepared ? "Ready to begin" : isMonitoring ? "Active" : "Paused";
  const canEnterFocus = activeSession.status === "active" && isMonitoring && isCameraAllowed;
  const checkInSummary = formatCheckIn(activeSession.preSessionCheckIn);

  const handlePrimaryAction = async () => {
    if (isPrepared) {
      setShowCameraDialog(true);
      return;
    }

    if (isPaused) {
      setIsResuming(true);
      try {
        await resumeSession();
      } finally {
        setIsResuming(false);
      }
    }
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/50 p-6 shadow-2xl backdrop-blur-xl">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Study Session</p>
      <h2 className="mt-3 text-2xl font-black text-white">
        {isPrepared ? "Your study task is ready." : isMonitoring ? "Your study session is active." : "Your study session is paused."}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        {isPrepared
          ? "Enable the camera to begin monitoring and start the session timer."
          : "You are currently working on:"}
      </p>

      <div className="mt-5 space-y-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Study task</p>
          <p className="mt-2 text-sm font-bold text-white">{formatTask(activeSession.taskDescription)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Elapsed</p>
            <p className="mt-2 font-mono text-lg font-bold text-cyan-200">{formatted}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</p>
            <p className="mt-2 text-sm font-bold text-white">{statusLabel}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Target</p>
          <p className="mt-2 text-sm font-bold text-white">{formatTargetDuration(activeSession.targetDurationMs)}</p>
        </div>
        {checkInSummary && <p className="text-xs capitalize text-slate-500">{checkInSummary}</p>}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
        {isPrepared || isPaused ? (
          <button type="button" onClick={() => void handlePrimaryAction()} disabled={isResuming} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition-all hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-70">
            {isPrepared ? "Enable Camera" : isResuming ? "Resuming..." : "Resume Study"}
          </button>
        ) : canEnterFocus ? (
          <Link href="/app/focus" className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-center text-sm font-semibold text-cyan-200 transition-all hover:bg-cyan-400/20">
            Enter Focus Space
          </Link>
        ) : null}
        <button type="button" onClick={() => router.push("/app/dashboard")} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800">
          View Dashboard
        </button>
      </div>
    </section>
  );
}
